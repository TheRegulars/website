package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/xeipuuv/gojsonschema"
	"gopkg.in/yaml.v2"
	"html/template"
	"io"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"
)

type Config struct {
	Servers map[string]ServerConfig `json:"servers,omitempty" yaml:"servers,omitempty"`
	GameDB  []string                `json:"gamedb,omitempty" yaml:"gamedb,omitempty"`
	GameDIR []string                `json:"gamedir,omitempty" yaml:"gamedir,omitempty"`
}

var serverPort = flag.Int("port", 8080, "HTTP Server port")
var serverHost = flag.String("addr", "", "Listen ip, empty by default")
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

func records(w http.ResponseWriter, r *http.Request) {
	conf := getConfig()
	records, err := ReadCaptimeRecords(conf.GameDB)
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
	w.Write(json)
}

func servers(w http.ResponseWriter, r *http.Request) {
	conf := getConfig()
	statuses := QueryRconServers(conf.Servers, time.Millisecond*800, 3)
	json, err := json.Marshal(statuses)
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
		Metrics  *ServerMetrics
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
	metrics, err := QueryServerMetrics(serverConf, time.Millisecond*800, 3)
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

func main() {
	var filename string

	flag.Parse()
	if flag.NArg() != 1 || *serverPort <= 0 || *serverPort > 65535 {
		fmt.Printf("Usage: %s config.yaml\n", os.Args[0])
		flag.PrintDefaults()
		os.Exit(1)
	}
	filename = flag.Arg(0)
	// TODO: reload config on SIGHUP
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

	go func() {
		sigHUP := make(chan os.Signal, 1)
		signal.Notify(sigHUP, syscall.SIGHUP)

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
			}
		}
	}()

	listenAddr := net.JoinHostPort(*serverHost, strconv.Itoa(*serverPort))
	http.HandleFunc("/healthz", healthz)
	http.HandleFunc("/records", records)
	http.HandleFunc("/servers", servers)
	http.HandleFunc("/exporters", exporters)
	http.HandleFunc("/metrics", metrics)
	http.HandleFunc("/maps", maps)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
