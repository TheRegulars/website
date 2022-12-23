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
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/TheRegulars/website/backend/pkg/rcon"
	"github.com/go-chi/chi/v5"
	"github.com/xeipuuv/gojsonschema"
	"gopkg.in/yaml.v2"
)

type Config struct {
	Servers map[string]rcon.ServerConfig `json:"servers,omitempty" yaml:"servers,omitempty"`
	GameDB  []string                     `json:"gamedb,omitempty" yaml:"gamedb,omitempty"`
	GameDIR []string                     `json:"gamedir,omitempty" yaml:"gamedir,omitempty"`
}

type ServerAll struct {
	*rcon.ServerStatus
	Info *rcon.ServerInfo `json:"info"`
}

//go:embed config_schema.json
var configSchema string

var serverPort = flag.Int("port", 8080, "HTTP Server port")
var serverHost = flag.String("addr", "", "Listen ip, empty by default")
var shutdownTimeout = flag.Duration("shutdownTimeout", time.Second*10, "Timeout for gracefull shutdown")

var config atomic.Value

var mapsState *MapsState
var viewTemplates = template.Must(template.Must(template.New("exporters").Parse(`
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
`)).New("metrics").Parse(`
# server: {{ .Name }}
{{if .Metrics.Status}}
# hostname: {{ .Metrics.Status.Hostname }}
# map: powerstation_r2
xonotic_sv_public{instance="{{ .Name }}"} {{ .Metrics.Status.Public }}

# Players info
xonotic_players_count{instance="{{ .Name }}"} {{ .Metrics.Status.PlayersActive }}
xonotic_players_max{instance="{{ .Name }}"} {{ .Metrics.Status.PlayersMax }}
xonotic_players_bots{instance="{{ .Name }}"} {{ .Metrics.PlayersInfo.Bots }}
xonotic_players_spectators{instance="{{ .Name }}"} {{ .Metrics.PlayersInfo.Spectators }}
xonotic_players_active{instance="{{ .Name }}"} {{ .Metrics.PlayersInfo.Active }}

# Performance timings
xonotic_timing_cpu{instance="{{ .Name }}"} {{ .Metrics.Status.Timing.CPU }}
xonotic_timing_lost{instance="{{ .Name }}"} {{ .Metrics.Status.Timing.Lost }}
xonotic_timing_offset_avg{instance="{{ .Name }}"} {{ .Metrics.Status.Timing.OffsetAvg }}
xonotic_timing_max{instance="{{ .Name }}"} {{ .Metrics.Status.Timing.OffsetMax }}
xonotic_timing_sdev{instance="{{ .Name }}"} {{ .Metrics.Status.Timing.OffsetSdev }}
{{end}}{{if .Metrics.Memory}}
# Memory
xonotic_memstats_pools_count{instance="{{ .Name }}"} {{ .Metrics.Memory.PoolsCount }}
xonotic_memstats_pools_total{instance="{{ .Name }}"} {{ .Metrics.Memory.PoolsTotal }}
xonotic_memstats_allocated_size{instance="{{ .Name }}"} {{ .Metrics.Memory.TotalAllocatedSize }}
{{end}}
# Network rtt {{ .Metrics.PingDuration }}
xonotic_rtt{instance="{{ .Name }}", from="{{ .Hostname }}"} {{ .Metrics.PingSeconds }}
`))

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
	records, err := ReadCaptimeRecordsWithFilter(conf.GameDB, filter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json, err := json.Marshal(records)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Etag", generateEtag(json))
	w.Write(json)
}

func servers(w http.ResponseWriter, r *http.Request) {
	var servers []string

	conf := getConfig()
	for k := range conf.Servers {
		servers = append(servers, k)
	}
	json, err := json.Marshal(struct {
		Servers []string `json:"servers"`
	}{servers})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(json)
}

func server(w http.ResponseWriter, r *http.Request) {
	conf := getConfig()
	serverName := chi.URLParam(r, "server")
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
	json, err := json.Marshal(status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(json)
}

func info(w http.ResponseWriter, r *http.Request) {
	var err error
	var info *rcon.ServerInfo

	conf := getConfig()
	serverName := chi.URLParam(r, "server")
	serverConf, ok := conf.Servers[serverName]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	info, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
		func(deadline time.Time) (*rcon.ServerInfo, error) {
			return rcon.QueryRconInfo(&serverConf, deadline)
		})
	if err != nil {
		http.Error(w, "Can't load data from server", http.StatusInternalServerError)
		return
	}
	json, err := json.Marshal(info)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(json)
}

func serverAll(w http.ResponseWriter, r *http.Request) {
	var wg sync.WaitGroup
	var infoErr, err error
	var info *rcon.ServerInfo
	var status *rcon.ServerStatus

	conf := getConfig()
	serverName := chi.URLParam(r, "server")
	serverConf, ok := conf.Servers[serverName]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	wg.Add(2)
	go func() {
		defer wg.Done()
		info, infoErr = rcon.QueryWithRetries(time.Millisecond*1000, 3,
			func(deadline time.Time) (*rcon.ServerInfo, error) {
				return rcon.QueryRconInfo(&serverConf, deadline)
			})
	}()

	go func() {
		defer wg.Done()
		status, err = rcon.QueryWithRetries(time.Millisecond*1000, 3,
			func(deadline time.Time) (*rcon.ServerStatus, error) {
				return rcon.QueryRconStatus(&serverConf, deadline)
			})
	}()

	wg.Wait()
	if err != nil || infoErr != nil {
		http.Error(w, "Can't load data from server", http.StatusInternalServerError)
		return
	}
	json, err := json.Marshal(ServerAll{
		ServerStatus: status,
		Info:         info,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(json)
}

func exporters(w http.ResponseWriter, r *http.Request) {
	var servers []string

	conf := getConfig()
	for k := range conf.Servers {
		servers = append(servers, k)
	}
	err := viewTemplates.ExecuteTemplate(w, "exporters", servers)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html")
}

func metrics(w http.ResponseWriter, r *http.Request) {
	var err error

	conf := getConfig()
	server := r.FormValue("target")
	templateContext := struct {
		Name     string
		Hostname string
		Metrics  *rcon.ServerMetrics
	}{
		Name:     server,
		Hostname: "",
		Metrics:  nil,
	}

	serverConf, ok := conf.Servers[server]
	if !ok {
		err = errors.New("Server not found")
		return
	}
	metrics, err := rcon.QueryServerMetrics(serverConf, time.Millisecond*800, 3)
	if err != nil {
		err = errors.New("Failed to load metrics")
		goto ErrorHandler
	}
	templateContext.Metrics = metrics
	templateContext.Hostname, err = os.Hostname()
	if err != nil {
		goto ErrorHandler
	}
	err = viewTemplates.ExecuteTemplate(w, "metrics", templateContext)
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
	json, err := json.Marshal(mapsList)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Etag", generateEtag(json))
	w.Write(json)
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
	var config Config

	data, err := ioutil.ReadFile(filename)
	if err != nil {
		log.Printf("Error reading config: %v", err)
		return nil, false
	}
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		log.Printf("Error parsing yaml config: %v", err)
		return nil, false
	}
	ok := validateConfig(&config)
	return &config, ok
}

func getConfig() *Config {
	val := config.Load()
	if val == nil {
		// something stored invalid config, bug in code
		panic("Nil config")
	}
	conf, ok := val.(*Config)
	if !ok {
		// something stored invalid config
		panic("Stored invalid config")
	}
	return conf
}

func webService() http.Handler {
	r := chi.NewRouter()
	r.Get("/healthz", healthz)
	r.Get("/records", records)
	r.Get("/servers", servers)
	r.Get("/servers/{server}", serverAll)
	r.Get("/servers/{server}/status", server)
	r.Get("/servers/{server}/info", info)
	r.Get("/exporters", exporters)
	r.Get("/metrics", metrics)
	r.Get("/maps", maps)
	return r
}

func main() {
	var filename string

	flag.Parse()
	if flag.NArg() != 1 || *serverPort <= 0 || *serverPort > 65535 {
		fmt.Printf("Usage: %s config.yaml\n", os.Args[0])
		flag.PrintDefaults()
		os.Exit(1)
	}
	filename = flag.Arg(0)
	conf, ok := loadConfig(filename)
	if !ok {
		fmt.Println("Configuration is invalid")
		os.Exit(1)
	}
	config.Store(conf)
	// init maps state
	mapsState = new(MapsState)
	mapsState.gameDirs = func() []string {
		return getConfig().GameDIR
	}

	listenAddr := net.JoinHostPort(*serverHost, strconv.Itoa(*serverPort))
	server := http.Server{Addr: listenAddr, Handler: webService()}
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
				log.Println("Received gracefull shutdown event")
				shutdownCtx, cancel := context.WithTimeout(serverCtx, *shutdownTimeout)
				go func() {
					<-shutdownCtx.Done()
					if shutdownCtx.Err() == context.DeadlineExceeded {
						log.Fatal("graceful shutdown timed out")
					}
				}()
				if err := server.Shutdown(shutdownCtx); err != nil {
					log.Fatal(err)
				}
				serverStopCtx()
				cancel()
				return
			}
		}
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	// wait till all requests is done
	<-serverCtx.Done()
}
