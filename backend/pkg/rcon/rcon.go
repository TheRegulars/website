//go:generate re2go rcon_parser.re --tags -W -o rcon_parser.go -i
package rcon

import (
	"bytes"
	"io"
	"log"
	"net"
	"strconv"
	"sync"
	"time"
)

const (
	rconNonSecureMode       = 0
	rconTimeSecureMode      = 1
	rconChallengeSecureMode = 2
	XonMSS                  = 1460
)

type ServerConfig struct {
	Server       string `json:"server" yaml:"server"`
	Port         int    `json:"port" yaml:"port"`
	RconPassword string `json:"rcon_password" yaml:"rcon_password"`
	RconMode     int    `json:"rcon_mode" yaml:"rcon_mode"`
}

type Player struct {
	IP     string `json:"-"`
	PL     int64  `json:"pl"`
	Ping   int64  `json:"ping"`
	Time   string `json:"time"`
	Frags  int64  `json:"frags"`
	Number int32  `json:"no"`
	Name   string `json:"name"`
	IsBot  bool   `json:"is_bot"`
}

type ServerStatus struct {
	Public   int32  `json:"sv_public"`
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

type ServerInfo struct {
	Gametype          string `json:"gametype"`
	Version           string `json:"version"`
	PureChangesCount  int64  `json:"pure_changes_count"`
	JoinAllowedCount  int64  `json:"join_allowed_count"`
	ServerFlags       int32  `json:"server_flags"`
	TermsOfServiceURL string `json:"terms_of_service"`
	ModName           string `json:"mod_name"`
	ScoreString       string `json:"score_string"`
}

type PlayerStats struct {
	Bots       int
	Spectators int
	Active     int
}

type ServerMemstats struct {
	PoolsCount         int32
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

func (r *rconReader) Close() error {
	return r.conn.Close()
}

func rconExecute(server *ServerConfig, deadline time.Time, cmd string) (io.ReadCloser, error) {
	var challenge []byte
	var w bytes.Buffer

	addr := net.JoinHostPort(server.Server, strconv.Itoa(server.Port))
	conn, err := net.Dial("udp", addr)
	if err != nil {
		return nil, err
	}
	conn.SetDeadline(deadline)
	readBuffer := make([]byte, XonMSS)
	// send rcon command
	if server.RconMode == rconChallengeSecureMode {
		_, err := conn.Write([]byte(ChallengeRequest))
		if err != nil {
			conn.Close()
			return nil, err
		}

		for {
			// read until we receive challenge response
			n, err := conn.Read(readBuffer)
			if err != nil {
				conn.Close()
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
		RconSecureChallengePacket(cmd, server.RconPassword, challenge, &w)
	} else if server.RconMode == rconTimeSecureMode {
		RconSecureTimePacket(cmd, server.RconPassword, time.Now(), &w)
	} else {
		RconNonSecurePacket(cmd, server.RconPassword, &w)
	}
	_, err = conn.Write(w.Bytes())
	if err != nil {
		conn.Close()
		return nil, err
	}
	return &rconReader{conn: conn, buf: readBuffer, slice: nil}, nil
}

func QueryRconStatus(server *ServerConfig, deadline time.Time) (*ServerStatus, error) {
	reader, err := rconExecute(server, deadline, "sv_public\x00status 1")
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return ParseStatus(reader)
}

func QueryRconInfo(server *ServerConfig, deadline time.Time) (*ServerInfo, error) {
	reader, err := rconExecute(server, deadline, "prvm_globalget server worldstatus")
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return ParseServerInfo(reader)
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
	reader, err := rconExecute(server, deadline, "memstats")
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return ParseMemstats(reader)
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
