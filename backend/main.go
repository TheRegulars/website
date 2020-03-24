package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/xeipuuv/gojsonschema"
	"gopkg.in/yaml.v2"
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
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
