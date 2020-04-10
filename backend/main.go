package main

import (
	"encoding/json"
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
	"strconv"
	"time"
)

type Config struct {
	Servers map[string]ServerConfig `json:"servers,omitempty" yaml:"servers,omitempty"`
	GameDB  []string                `json:"gamedb,omitempty" yaml:"gamedb,omitempty"`
}

var serverPort = flag.Int("port", 8080, "HTTP Server port")
var serverHost = flag.String("addr", "", "Listen ip, empty by default")
var config Config
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

# Network rtt
xonotic_rtt{instance="mars.regulars.win", from="pub.regulars.win"} 0.00014080300752539188
`))

func healthz(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "OK\n")
}

func records(w http.ResponseWriter, r *http.Request) {
	records, err := ReadCaptimeRecords(config.GameDB)
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
	statuses := QueryRconServers(config.Servers, time.Millisecond*800, 3)
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
	for k := range config.Servers {
		servers = append(servers, k)
	}
	w.Header().Set("Content-Type", "text/html")
	err := viewTemplates.ExecuteTemplate(w, "exporters", servers)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	server := r.FormValue("target")
	serverConf, ok := config.Servers[server]
	if !ok {
		http.Error(w, "Server not found", http.StatusNotFound)
		return
	}
	metrics, err := QueryServerMetrics(serverConf, time.Millisecond*800, 3)
	if err != nil {
		http.Error(w, "Failed to load metrics", http.StatusInternalServerError)
		return
	}
	templateContext := struct {
		Name    string
		Metrics *ServerMetrics
	}{
		Name:    server,
		Metrics: metrics,
	}
	err = viewTemplates.ExecuteTemplate(w, "metrics", templateContext)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func validateConfig(conf *Config) {
	schemaLoader := gojsonschema.NewStringLoader(configSchema)
	schema, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		panic(err)
	}
	documentLoader := gojsonschema.NewGoLoader(conf)
	res, err := schema.Validate(documentLoader)
	if err != nil {
		panic(err)
	}
	if !res.Valid() {
		fmt.Println("Configuration is invalid: ")
		for _, err := range res.Errors() {
			fmt.Println(err)
		}
		os.Exit(1)
	}
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
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		log.Fatal(err)
	}

	err = yaml.Unmarshal(data, &config)
	if err != nil {
		log.Fatal(err)
	}

	// TODO: reload config on SIGHUP
	validateConfig(&config)
	if err != nil {
		log.Fatal(err)
	}

	listenAddr := net.JoinHostPort(*serverHost, strconv.Itoa(*serverPort))
	http.HandleFunc("/healthz", healthz)
	http.HandleFunc("/records", records)
	http.HandleFunc("/servers", servers)
	http.HandleFunc("/exporters", exporters)
	http.HandleFunc("/metrics", metrics)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
