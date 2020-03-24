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
	PlayersActive int64    `json:"players_max"`
	PlayersMax    int64    `json:"players_max"`
	Players       []Player `json:"players,omitempty"`
}

type rconReader struct {
	conn net.Conn
}

var psvStatusRe *regexp.Regexp = regexp.MustCompile(`^"sv_public"\s+is\s+"(-?\d+)`)
var pTimingRe *regexp.Regexp = regexp.MustCompile(
	`^timing:\s+(?P<cpu>-?[\d\.]+)%\s+CPU,\s+(?P<lost>-?[\d\.]+)%\s+lost,\s+` +
		`offset\s+avg\s+(?P<offset_avg>-?[\d\.]+)ms,\s+max\s+(?P<max>-?[\d\.]+)ms,\s+sdev\s+(?P<sdev>-?[\d\.]+)ms`)
var pPlayersRe *regexp.Regexp = regexp.MustCompile(`^players:\s+(?P<count>\d+)\s+active\s+\((?P<max>\d+)\s+max\)`)
var playerRe *regexp.Regexp = regexp.MustCompile(`^\^(?:3|7)(?P<ip>[^\s]+)\s+(?P<pl>-?\d+)\s+` +
	`(?P<ping>-?\d+)\s+(?P<time>[\d:]+)\s+(?P<frags>-?\d+)\s+#(?P<no>\d+)\s+\^7(?P<nick>.*)$`)

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
				status.Version = strings.TrimSpace(string(line[len(protocolPrefix):]))
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

func (r *rconReader) Read(p []byte) (int, error) {
	for {
		n, err := r.conn.Read(p)
		if err != nil {
			return 0, err
		}
		if bytes.HasPrefix(p[:n], []byte(RconResponseHeader)) {
			copy(p, p[len(RconResponseHeader):n])
			return n - len(RconResponseHeader), nil
		}
	}
}

func QueryRconStatus(server *ServerConfig, deadline time.Time) (*ServerStatus, error) {
	var status ServerStatus
	var challenge []byte
	var w bytes.Buffer

	command := "sv_public\x00status 1"
	addr := net.JoinHostPort(server.Server, strconv.Itoa(server.Port))
	conn, err := net.Dial("udp", addr)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	conn.SetDeadline(deadline)
	readBuffer := make([]byte, XonMSS)
	// send rcon command
	if server.RconMode == rconChallengeSecureMode {
		_, err := conn.Write([]byte(ChallengeRequest))
		if err != nil {
			return nil, err
		}

		for {
			// read until we receive challenge response
			n, err := conn.Read(readBuffer)
			if err != nil {
				return nil, err
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
		RconSecureChallengePacket(command, server.RconPassword, challenge, &w)
	} else if server.RconMode == rconTimeSecureMode {
		RconSecureTimePacket(command, server.RconPassword, time.Now(), &w)
	} else {
		RconNonSecurePacket(command, server.RconPassword, &w)
	}
	_, err = conn.Write(w.Bytes())
	if err != nil {
		return nil, err
	}
	rconReader := &rconReader{conn: conn}
	scanner := bufio.NewScanner(rconReader)
	scanner.Buffer(readBuffer, XonMSS)
	err = ParseRconStatus(scanner, &status)
	return &status, err
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
