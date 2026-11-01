package main

import (
	"context"
	"crypto/md5"
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	texttemplate "text/template"
	"time"

	"github.com/TheRegulars/website/backend/pkg/rcon"
	"github.com/xeipuuv/gojsonschema"
	"go.yaml.in/yaml/v3"
	"golang.org/x/sync/errgroup"
)

type Config struct {
	Servers map[string]rcon.ServerConfig `json:"servers,omitempty" yaml:"servers,omitempty"`
	GameDB  []string                     `json:"gamedb,omitempty" yaml:"gamedb,omitempty"`
	GameDIR []string                     `json:"gamedir,omitempty" yaml:"gamedir,omitempty"`
}

type ServerAll struct {
	*rcon.ServerStatus
	Info   *rcon.ServerInfo   `json:"info"`
	Scores *rcon.ServerScores `json:"scores"`
}

//go:embed config_schema.json
var configSchema string

var (
	serverPort      = flag.Int("port", 8080, "HTTP Server port")
	serverHost      = flag.String("addr", "", "Listen ip, empty by default")
	shutdownTimeout = flag.Duration("shutdownTimeout", time.Second*10, "Timeout for graceful shutdown")
	pprofSockPath   = flag.String("pprofSocket", "", "PProf UNIX socket path")
)

var config atomic.Pointer[Config]

var (
	mapsState         *MapsState
	exportersTemplate = template.Must(template.New("exporters").Parse(`
<html>
  <head>
    <title>Xonotic Exporter</title>
  </head>
  <body>
    <h1>Xonotic Exporter</h1>
	<ul>
	{{range .}}<li><a href="/metrics?target={{ . }}">{{ . }}</a></li>{{end}}
	</ul>
  </body>
</html>
`))
	metricsTemplate = texttemplate.Must(texttemplate.New("metrics").Funcs(texttemplate.FuncMap{
		"label": escapeLabelValue,
	}).Parse(`
# server: {{ .Name }}
{{if .Metrics.Status}}
# hostname: {{ .Metrics.Status.Hostname }}
# map: {{ .Metrics.Status.Map }}
xonotic_sv_public{instance="{{ label .Name }}"} {{ .Metrics.Status.Public }}

# Players info
xonotic_players_count{instance="{{ label .Name }}"} {{ .Metrics.Status.PlayersActive }}
xonotic_players_max{instance="{{ label .Name }}"} {{ .Metrics.Status.PlayersMax }}
xonotic_players_bots{instance="{{ label .Name }}"} {{ .Metrics.PlayersInfo.Bots }}
xonotic_players_spectators{instance="{{ label .Name }}"} {{ .Metrics.PlayersInfo.Spectators }}
xonotic_players_active{instance="{{ label .Name }}"} {{ .Metrics.PlayersInfo.Active }}

# Performance timings
xonotic_timing_cpu{instance="{{ label .Name }}"} {{ .Metrics.Status.Timing.CPU }}
xonotic_timing_lost{instance="{{ label .Name }}"} {{ .Metrics.Status.Timing.Lost }}
xonotic_timing_offset_avg{instance="{{ label .Name }}"} {{ .Metrics.Status.Timing.OffsetAvg }}
xonotic_timing_max{instance="{{ label .Name }}"} {{ .Metrics.Status.Timing.OffsetMax }}
xonotic_timing_sdev{instance="{{ label .Name }}"} {{ .Metrics.Status.Timing.OffsetSdev }}
{{end}}{{if .Metrics.Memory}}
# Memory
xonotic_memstats_pools_count{instance="{{ label .Name }}"} {{ .Metrics.Memory.PoolsCount }}
xonotic_memstats_pools_total{instance="{{ label .Name }}"} {{ .Metrics.Memory.PoolsTotal }}
xonotic_memstats_allocated_size{instance="{{ label .Name }}"} {{ .Metrics.Memory.TotalAllocatedSize }}
{{end}}
# Network rtt {{ .Metrics.PingDuration }}
xonotic_rtt{instance="{{ label .Name }}", from="{{ label .Hostname }}"} {{ .Metrics.PingSeconds }}
`))
)

var labelValueEscaper = strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`)

// escapeLabelValue escapes a Prometheus label value.
func escapeLabelValue(s string) string {
	return labelValueEscaper.Replace(s)
}

func healthz(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "OK\n")
}

func generateEtag(data []byte) string {
	return fmt.Sprintf("%x", md5.Sum(data))
}

func records(w http.ResponseWriter, r *http.Request) {
	conf := getConfig()
	mapsSet := mapsState.GetMapsSet()
	filter := func(key, value string) bool {
		i := strings.Index(key, "/")
		if i >= 0 {
			mapname := key[:i]
			if _, ok := mapsSet[mapname]; ok {
				return true
			} else {
				return false
			}
		} else {
			return false
		}
	}
	recs, err := ReadCaptimeRecordsWithFilter(conf.GameDB, filter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data, err := json.Marshal(recs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Etag", generateEtag(data))
	w.Write(data)
}

func servers(w http.ResponseWriter, r *http.Request) {
	var names []string

	conf := getConfig()
	for k := range conf.Servers {
		names = append(names, k)
	}
	sort.Strings(names)
	data, err := json.Marshal(struct {
		Servers []string `json:"servers"`
	}{names})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func server(w http.ResponseWriter, r *http.Request) {
	conf := getConfig()
	serverName := r.PathValue("server")
	serverConf, ok := conf.Servers[serverName]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	status, err := rcon.QueryWithRetries(time.Millisecond*1000, 3,
		func(deadline time.Time) (*rcon.ServerStatus, error) {
			return rcon.QueryRconStatus(&serverConf, deadline)
		})
	if err != nil {
		http.Error(w, "Can't load data from server", http.StatusInternalServerError)
		return
	}
	data, err := json.Marshal(status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func info(w http.ResponseWriter, r *http.Request) {
	var err error
	var serverInfo *rcon.ServerInfo

	conf := getConfig()
	serverName := r.PathValue("server")
	serverConf, ok := conf.Servers[serverName]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	serverInfo, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
		func(deadline time.Time) (*rcon.ServerInfo, error) {
			return rcon.QueryRconInfo(&serverConf, deadline)
		})
	if err != nil {
		http.Error(w, "Can't load data from server", http.StatusInternalServerError)
		return
	}
	data, err := json.Marshal(serverInfo)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func scores(w http.ResponseWriter, r *http.Request) {
	var err error
	var serverScores *rcon.ServerScores

	conf := getConfig()
	serverName := r.PathValue("server")
	serverConf, ok := conf.Servers[serverName]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	serverScores, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
		func(deadline time.Time) (*rcon.ServerScores, error) {
			return rcon.QueryRconScores(&serverConf, deadline)
		})
	if err != nil {
		http.Error(w, "Can't load data from server", http.StatusInternalServerError)
		return
	}
	data, err := json.Marshal(serverScores)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func serverAll(w http.ResponseWriter, r *http.Request) {
	var g errgroup.Group
	var serverInfo *rcon.ServerInfo
	var status *rcon.ServerStatus
	var serverScores *rcon.ServerScores

	conf := getConfig()
	serverName := r.PathValue("server")
	serverConf, ok := conf.Servers[serverName]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	g.Go(func() (err error) {
		serverInfo, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
			func(deadline time.Time) (*rcon.ServerInfo, error) {
				return rcon.QueryRconInfo(&serverConf, deadline)
			})
		return err
	})
	g.Go(func() (err error) {
		status, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
			func(deadline time.Time) (*rcon.ServerStatus, error) {
				return rcon.QueryRconStatus(&serverConf, deadline)
			})
		return err
	})
	g.Go(func() (err error) {
		serverScores, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
			func(deadline time.Time) (*rcon.ServerScores, error) {
				return rcon.QueryRconScores(&serverConf, deadline)
			})
		return err
	})

	if err := g.Wait(); err != nil {
		http.Error(w, "Can't load data from server", http.StatusInternalServerError)
		return
	}
	data, err := json.Marshal(ServerAll{
		ServerStatus: status,
		Info:         serverInfo,
		Scores:       serverScores,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func exporters(w http.ResponseWriter, r *http.Request) {
	var names []string

	conf := getConfig()
	for k := range conf.Servers {
		names = append(names, k)
	}
	sort.Strings(names)
	err := exportersTemplate.Execute(w, names)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html")
}

func metrics(w http.ResponseWriter, r *http.Request) {
	var err error

	conf := getConfig()
	serverName := r.FormValue("target")
	templateContext := struct {
		Name     string
		Hostname string
		Metrics  *rcon.ServerMetrics
	}{
		Name:     serverName,
		Hostname: "",
		Metrics:  nil,
	}

	serverConf, ok := conf.Servers[serverName]
	if !ok {
		err = errors.New("Server not found")
		return
	}
	serverMetrics, err := rcon.QueryServerMetrics(serverConf, time.Millisecond*800, 3)
	if err != nil {
		err = errors.New("Failed to load metrics")
		goto ErrorHandler
	}
	templateContext.Metrics = serverMetrics
	templateContext.Hostname, err = os.Hostname()
	if err != nil {
		goto ErrorHandler
	}
	err = metricsTemplate.Execute(w, templateContext)
	if err != nil {
		goto ErrorHandler
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	return
ErrorHandler:
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func maps(w http.ResponseWriter, r *http.Request) {
	mapsList := mapsState.ListMaps()
	data, err := json.Marshal(mapsList)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Etag", generateEtag(data))
	w.Write(data)
}

func validateConfig(conf *Config) bool {
	schemaLoader := gojsonschema.NewStringLoader(configSchema)
	schema, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		// configuration schema is invalid, this means some mistake in code
		panic(err)
	}
	documentLoader := gojsonschema.NewGoLoader(conf)
	res, err := schema.Validate(documentLoader)
	if err != nil {
		log.Printf("Error validating config: %v", err)
		return false
	}
	if !res.Valid() {
		for _, err := range res.Errors() {
			log.Println(err)
		}
		return false
	}
	return true
}

func loadConfig(filename string) (*Config, bool) {
	var conf Config

	data, err := os.ReadFile(filename)
	if err != nil {
		log.Printf("Error reading config: %v", err)
		return nil, false
	}
	err = yaml.Unmarshal(data, &conf)
	if err != nil {
		log.Printf("Error parsing yaml config: %v", err)
		return nil, false
	}
	ok := validateConfig(&conf)
	return &conf, ok
}

func getConfig() *Config {
	return config.Load()
}

func webService() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthz)
	mux.HandleFunc("GET /records", records)
	mux.HandleFunc("GET /servers", servers)
	mux.HandleFunc("GET /maps", maps)
	mux.HandleFunc("GET /servers/{server}", serverAll)
	mux.HandleFunc("GET /servers/{server}/status", server)
	mux.HandleFunc("GET /servers/{server}/info", info)
	mux.HandleFunc("GET /servers/{server}/scores", scores)
	mux.HandleFunc("GET /exporters", exporters)
	mux.HandleFunc("GET /metrics", metrics)
	return mux
}

func main() {
	var filename string

	flag.Parse()
	if flag.NArg() != 1 || *serverPort <= 0 || *serverPort > 65535 {
		fmt.Fprintf(os.Stderr, "Usage: %s config.yaml\n", os.Args[0])
		flag.PrintDefaults()
		os.Exit(1)
	}
	filename = flag.Arg(0)
	conf, ok := loadConfig(filename)
	if !ok {
		fmt.Fprintf(os.Stderr, "Configuration is invalid")
		os.Exit(1)
	}
	config.Store(conf)
	if *pprofSockPath != "" {
		ListenPProf(*pprofSockPath)
	}
	// init maps state
	mapsState = new(MapsState)
	mapsState.gameDirs = func() []string {
		return getConfig().GameDIR
	}

	listenAddr := net.JoinHostPort(*serverHost, strconv.Itoa(*serverPort))
	httpServer := http.Server{Addr: listenAddr, Handler: webService()}
	serverCtx, serverStopCtx := context.WithCancel(context.Background())

	go func() {
		sigHUP := make(chan os.Signal, 1)
		signal.Notify(sigHUP, syscall.SIGHUP)
		sigQuit := make(chan os.Signal, 1)
		signal.Notify(sigQuit, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

		for {
			select {
			case <-sigHUP:
				conf, ok := loadConfig(filename)
				if !ok {
					log.Println("Config wasn't updated because of errors")
				} else {
					config.Store(conf)
					log.Println("Successfully updated config")
				}
			case <-sigQuit:
				log.Println("Received graceful shutdown event")
				shutdownCtx, cancel := context.WithTimeout(serverCtx, *shutdownTimeout)
				go func() {
					<-shutdownCtx.Done()
					if shutdownCtx.Err() == context.DeadlineExceeded {
						log.Fatal("graceful shutdown timed out")
					}
				}()
				if err := httpServer.Shutdown(shutdownCtx); err != nil {
					log.Fatal(err)
				}
				serverStopCtx()
				cancel()
				return
			}
		}
	}()

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	// wait till all requests is done
	<-serverCtx.Done()
}
