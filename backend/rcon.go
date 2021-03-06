package main

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	rconNonSecureMode       = 0
	rconTimeSecureMode      = 1
	rconChallengeSecureMode = 2
	XonMSS                  = 1400
	hostPrefix              = "host:     "
	versionPrefix           = "version:  "
	protocolPrefix          = "protocol: "
	mapPrefix               = "map:      "
)

type ServerConfig struct {
	Server       string `json:"server" yaml:"server"`
	Port         int    `json:"port" yaml:"port"`
	RconPassword string `json:"rcon_password" yaml:"rcon_password"`
	RconMode     int    `json:"rcon_mode" yaml:"rcon_mode"`
}

type Player struct {
	IP     string `json:"-"`
	PL     int    `json:"pl"`
	Ping   int    `json:"ping"`
	Time   string `json:"time"`
	Frags  int64  `json:"frags"`
	Number int    `json:"no"`
	Name   string `json:"name"`
	IsBot  bool   `json:"is_bot"`
}

type ServerStatus struct {
	Public   int    `json:"sv_public"`
	Hostname string `json:"host"`
	Version  string `json:"version"`
	Protocol string `json:"protocol"`
	Map      string `json:"map"`
	Timing   struct {
		CPU        float64 `json:"cpu"`
		Lost       float64 `json:"lost"`
		OffsetAvg  float64 `json:"offset_avg"`
		OffsetMax  float64 `json:"offset_max"`
		OffsetSdev float64 `json:"offset_sdev"`
	} `json:"timing"`
	PlayersActive int64    `json:"players_count"`
	PlayersMax    int64    `json:"players_max"`
	Players       []Player `json:"players,omitempty"`
}

type PlayerStats struct {
	Bots       int
	Spectators int
	Active     int
}

type ServerMemstats struct {
	PoolsCount         int
	PoolsTotal         int64
	TotalAllocatedSize int64
}

type ServerMetrics struct {
	Status       *ServerStatus
	PlayersInfo  PlayerStats
	Memory       *ServerMemstats
	PingDuration time.Duration
	PingSeconds  float64
}

type rconReader struct {
	conn  net.Conn
	buf   []byte
	slice []byte
}

type RconCallback = func(scanner *bufio.Scanner, result interface{}) error

type RconScannerRPC struct {
	callback RconCallback
	state    interface{}
	command  string
}

var psvStatusRe *regexp.Regexp = regexp.MustCompile(`^"sv_public"\s+is\s+"(-?\d+)`)
var pTimingRe *regexp.Regexp = regexp.MustCompile(
	`^timing:\s+(?P<cpu>-?[\d\.]+)%\s+CPU,\s+(?P<lost>-?[\d\.]+)%\s+lost,\s+` +
		`offset\s+avg\s+(?P<offset_avg>-?[\d\.]+)ms,\s+max\s+(?P<max>-?[\d\.]+)ms,\s+sdev\s+(?P<sdev>-?[\d\.]+)ms`)
var pPlayersRe *regexp.Regexp = regexp.MustCompile(`^players:\s+(?P<count>\d+)\s+active\s+\((?P<max>\d+)\s+max\)`)
var playerRe *regexp.Regexp = regexp.MustCompile(`^\^(?:3|7)(?P<ip>[^\s]+)\s+(?P<pl>-?\d+)\s+` +
	`(?P<ping>-?\d+)\s+(?P<time>[\d:]+)\s+(?P<frags>-?\d+)\s+#(?P<no>\d+)\s+\^7(?P<nick>.*)$`)

var memPoolsRe *regexp.Regexp = regexp.MustCompile(`^(?P<count>\d+) memory pools, totalling (?P<count>\d+) bytes`)
var memAllocatedRe *regexp.Regexp = regexp.MustCompile(`^total allocated size: (?P<allocated>\d+) bytes`)

func parseRconPlayer(line []byte, p *Player) error {
	var err error = nil

	res := playerRe.FindSubmatch(line)
	if len(res) != (playerRe.NumSubexp() + 1) {
		return fmt.Errorf("Invalid players line: %q", string(line))
	}

	p.IP = strings.TrimSpace(string(res[1]))
	d, err := strconv.ParseInt(string(res[2]), 10, 32)
	if err != nil {
		goto DONE
	}
	p.PL = int(d)
	d, err = strconv.ParseInt(string(res[3]), 10, 32)
	if err != nil {
		goto DONE
	}
	p.Ping = int(d)
	p.Time = strings.TrimSpace(string(res[4]))
	d, err = strconv.ParseInt(string(res[5]), 10, 64)
	if err != nil {
		goto DONE
	}
	p.Frags = d
	d, err = strconv.ParseInt(string(res[6]), 10, 32)
	if err != nil {
		goto DONE
	}
	p.Number = int(d)
	p.Name = string(res[7])
	if p.IP == "botclient" {
		p.IsBot = true
	} else {
		p.IsBot = false
	}
DONE:
	return err
}

func ParseRconStatus(scanner *bufio.Scanner, status *ServerStatus) error {
	parseState := 0
	var parsedPlayers int64 = 0
	var player Player
LOOP:
	for scanner.Scan() {
		line := scanner.Bytes()
		switch parseState {
		case 0:
			res := psvStatusRe.FindSubmatch(line)
			if len(res) != 2 {
				return fmt.Errorf("Failed to parse first line: %q", string(line))
			}
			public, err := strconv.ParseInt(string(res[1]), 10, 32)
			if err != nil {
				return err
			}
			status.Public = int(public)
			parseState = 1
		case 1:
			if bytes.HasPrefix(line, []byte(hostPrefix)) {
				status.Hostname = strings.TrimSpace(string(line[len(hostPrefix):]))
				parseState = 2
			} else {
				return errors.New("Failed to parse hostname")
			}
		case 2:
			if bytes.HasPrefix(line, []byte(versionPrefix)) {
				status.Version = strings.TrimSpace(string(line[len(versionPrefix):]))
				parseState = 3
			} else {
				return errors.New("Failed to parse version")
			}
		case 3:
			if bytes.HasPrefix(line, []byte(protocolPrefix)) {
				status.Protocol = strings.TrimSpace(string(line[len(protocolPrefix):]))
				parseState = 4
			} else {
				return errors.New("Failed to parse protocol")
			}
		case 4:
			if bytes.HasPrefix(line, []byte(mapPrefix)) {
				status.Map = strings.TrimSpace(string(line[len(mapPrefix):]))
				parseState = 5
			} else {
				return errors.New("Failed to parse map name")
			}
		case 5:
			res := pTimingRe.FindSubmatch(line)
			if len(res) != (pTimingRe.NumSubexp() + 1) {
				return errors.New("Failed to parse timings")
			}
			// this should be unrolled by compiler
			for i := 1; i < 6; i++ {
				f, err := strconv.ParseFloat(string(res[i]), 64)
				if err != nil {
					return err
				}
				switch i {
				case 1:
					status.Timing.CPU = f
				case 2:
					status.Timing.Lost = f
				case 3:
					status.Timing.OffsetAvg = f
				case 4:
					status.Timing.OffsetMax = f
				case 5:
					status.Timing.OffsetSdev = f
				}
			}
			parseState = 6
		case 6:
			res := pPlayersRe.FindSubmatch(line)
			if len(res) != (pPlayersRe.NumSubexp() + 1) {
				return errors.New("Failed to parse players count")
			}
			// loop should be unrolled
			for i := 1; i < 3; i++ {
				d, err := strconv.ParseInt(string(res[i]), 10, 32)
				if err != nil {
					return err
				}
				switch i {
				case 1:
					status.PlayersActive = d
				case 2:
					status.PlayersMax = d
				}
			}
			if status.PlayersActive == 0 {
				// server has no players, so there is no point in continuing parsing
				break LOOP
			}
			parseState = 7
		case 7:
			if bytes.HasPrefix(line, []byte("^2IP                                             %pl")) {
				parseState = 8
			}
		case 8:
			err := parseRconPlayer(line, &player)
			if err != nil {
				return err
			}
			status.Players = append(status.Players, player)
			parsedPlayers++
			if parsedPlayers == status.PlayersActive {
				// all players from server were parsed, we done
				break LOOP
			}
		default:
			return errors.New("Impossible")
		}
	}
	return scanner.Err()
}

func ParseMemstats(scanner *bufio.Scanner, stats *ServerMemstats) error {
	parseState := 0
LOOP:
	for scanner.Scan() {
		line := scanner.Bytes()
		switch parseState {
		case 0:
			res := memPoolsRe.FindSubmatch(line)
			if len(res) != (memPoolsRe.NumSubexp() + 1) {
				return errors.New("Failed to parse memstats")
			}
			d, err := strconv.ParseInt(string(res[1]), 10, 32)
			if err != nil {
				return err
			}
			stats.PoolsCount = int(d)
			d, err = strconv.ParseInt(string(res[2]), 10, 64)
			if err != nil {
				return err
			}
			stats.PoolsTotal = d
			parseState = 1
		case 1:
			res := memAllocatedRe.FindSubmatch(line)
			if len(res) != (memAllocatedRe.NumSubexp() + 1) {
				return errors.New("Failed to parse memstats")
			}
			d, err := strconv.ParseInt(string(res[1]), 10, 64)
			if err != nil {
				return err
			}
			stats.TotalAllocatedSize = d
			break LOOP
		default:
			return errors.New("Impossible state")
		}
	}
	return scanner.Err()
}

func (r *rconReader) Read(p []byte) (int, error) {
	if len(r.slice) == 0 {
		for {
			n, err := r.conn.Read(r.buf)
			if err != nil {
				return 0, err
			}
			if bytes.HasPrefix(r.buf[:n], []byte(RconResponseHeader)) {
				r.slice = r.buf[len(RconResponseHeader):n]
				break
			}
		}
	}
	num := copy(p, r.slice)
	r.slice = r.slice[num:len(r.slice)]
	return num, nil
}

func rconScanner(server *ServerConfig, deadline time.Time, rpc RconScannerRPC) error {
	var challenge []byte
	var w bytes.Buffer

	addr := net.JoinHostPort(server.Server, strconv.Itoa(server.Port))
	conn, err := net.Dial("udp", addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.SetDeadline(deadline)
	readBuffer := make([]byte, XonMSS)
	// send rcon command
	if server.RconMode == rconChallengeSecureMode {
		_, err := conn.Write([]byte(ChallengeRequest))
		if err != nil {
			return err
		}

		for {
			// read until we receive challenge response
			n, err := conn.Read(readBuffer)
			if err != nil {
				return err
			}
			if bytes.HasPrefix(readBuffer[:n], []byte(ChallengeHeader)) {
				challengeEnd := len(ChallengeHeader)

				for i := len(ChallengeHeader); i < n; i++ {
					if readBuffer[i] == '\x00' {
						challengeEnd = i
						break
					}
				}
				challenge = readBuffer[len(ChallengeHeader):challengeEnd]
				break
			}
		}
		RconSecureChallengePacket(rpc.command, server.RconPassword, challenge, &w)
	} else if server.RconMode == rconTimeSecureMode {
		RconSecureTimePacket(rpc.command, server.RconPassword, time.Now(), &w)
	} else {
		RconNonSecurePacket(rpc.command, server.RconPassword, &w)
	}
	_, err = conn.Write(w.Bytes())
	if err != nil {
		return err
	}
	rconReader := &rconReader{conn: conn, buf: readBuffer, slice: nil}
	scanner := bufio.NewScanner(rconReader)
	return rpc.callback(scanner, rpc.state)
}

func QueryRconStatus(server *ServerConfig, deadline time.Time) (*ServerStatus, error) {
	var status ServerStatus
	callback := func(s *bufio.Scanner, result interface{}) error {
		status, ok := result.(*ServerStatus)
		if !ok {
			return errors.New("Invalid result type")
		}
		return ParseRconStatus(s, status)
	}
	rpc := RconScannerRPC{
		command:  "sv_public\x00status 1",
		callback: callback,
		state:    &status,
	}
	err := rconScanner(server, deadline, rpc)
	if err == nil {
		return &status, err
	} else {
		return nil, err
	}
}

func PingServer(server *ServerConfig, deadline time.Time) (time.Duration, error) {
	addr := net.JoinHostPort(server.Server, strconv.Itoa(server.Port))
	invalidDuration := time.Second * -1
	conn, err := net.Dial("udp", addr)
	if err != nil {
		return invalidDuration, err
	}
	defer conn.Close()
	conn.SetDeadline(deadline)
	readBuffer := make([]byte, XonMSS)
	conn.Write([]byte(PingPacket))
	start := time.Now()
	n, err := conn.Read(readBuffer)
	if err != nil {
		return invalidDuration, err
	}

	if bytes.HasPrefix(readBuffer[:n], []byte(PingResponse)) {
		diff := time.Now().Sub(start)
		return diff, nil
	}
	return invalidDuration, err
}

func QueryRconMemstats(server *ServerConfig, deadline time.Time) (*ServerMemstats, error) {
	var memstats ServerMemstats
	callback := func(s *bufio.Scanner, result interface{}) error {
		stats, ok := result.(*ServerMemstats)
		if !ok {
			return errors.New("Invalid result type")
		}
		return ParseMemstats(s, stats)
	}
	rpc := RconScannerRPC{
		command:  "memstats",
		callback: callback,
		state:    &memstats,
	}

	err := rconScanner(server, deadline, rpc)
	if err == nil {
		return &memstats, err
	} else {
		return nil, err
	}
}

func QueryRconServer(conf ServerConfig, timeout time.Duration, retries int) (*ServerStatus, error) {
	var status *ServerStatus
	var err error

	for i := 0; i < retries; i++ {
		deadline := time.Now().Add(timeout)
		status, err = QueryRconStatus(&conf, deadline)
		if err == nil {
			return status, nil
		}
		log.Printf("rcon error: %v", err)
	}

	return status, err
}

func QueryRconServers(servers map[string]ServerConfig, timeout time.Duration, retries int) map[string]*ServerStatus {
	var mux sync.Mutex
	var wg sync.WaitGroup

	statuses := make(map[string]*ServerStatus, len(servers))
	for k, v := range servers {
		wg.Add(1)
		go func(key string, conf ServerConfig) {
			defer wg.Done()
			for i := 0; i < retries; i++ {
				deadline := time.Now().Add(timeout)
				status, err := QueryRconStatus(&conf, deadline)
				if err == nil {
					mux.Lock()
					statuses[key] = status
					mux.Unlock()
					return
				}
				log.Printf("rcon error: %v", err)
			}
		}(k, v)
	}
	wg.Wait()

	return statuses
}

func QueryServerMetrics(server ServerConfig, timeout time.Duration, retries int) (*ServerMetrics, error) {
	var metrics ServerMetrics
	var wg sync.WaitGroup
	var statusErr error
	var pingErr error
	var memstatsErr error

	metrics.PlayersInfo.Bots = 0
	metrics.PlayersInfo.Spectators = 0
	metrics.PlayersInfo.Active = 0

	wg.Add(3)
	go func(s *ServerConfig, retries int) {
		defer wg.Done()
		for i := 0; i < retries; i++ {
			deadline := time.Now().Add(timeout)
			status, statusErr := QueryRconStatus(s, deadline)
			if statusErr == nil {
				metrics.Status = status
				for _, p := range status.Players {
					if p.IsBot {
						metrics.PlayersInfo.Bots++
					}

					if p.Frags == -666 {
						metrics.PlayersInfo.Spectators++
					} else {
						metrics.PlayersInfo.Active++
					}
				}
				return
			}
			log.Printf("rcon error: %v", statusErr)
		}
	}(&server, retries)

	go func(s *ServerConfig, retries int) {
		defer wg.Done()
		for i := 0; i < retries; i++ {
			deadline := time.Now().Add(timeout)
			d, pingErr := PingServer(s, deadline)
			if pingErr == nil {
				metrics.PingDuration = d
				metrics.PingSeconds = float64(d) / float64(time.Second)
				return
			}
			log.Printf("ping error: %v", pingErr)
		}
	}(&server, retries)

	go func(s *ServerConfig, retries int) {
		defer wg.Done()
		for i := 0; i < retries; i++ {
			deadline := time.Now().Add(timeout)
			mem, memstatsErr := QueryRconMemstats(s, deadline)
			if memstatsErr == nil {
				metrics.Memory = mem
				return
			}
			log.Printf("memstats error: %v", memstatsErr)
		}
	}(&server, retries)
	wg.Wait()
	err := statusErr
	if err == nil {
		if pingErr != nil {
			err = pingErr
		} else {
			err = memstatsErr
		}
	}
	return &metrics, err
}
