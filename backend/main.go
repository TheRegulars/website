package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"gopkg.in/yaml.v2"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
)

const (
	captimeNetnameSuf = "/captimerecord/netname"
	captimeSuf        = "/captimerecord/time"
)

type ServerConfig struct {
	Server       string `yaml:"server"`
	Port         int    `yaml:"port"`
	RconPassword string `yaml:"rcon_password"`
	RconMode     int    `yaml:"rcon_mode"`
}

type Config struct {
	Servers map[string]ServerConfig `yaml:"servers,omitempty"`
	GameDB  []string                `yaml:"gamedb,omitempty"`
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
	w.WriteHeader(http.StatusInternalServerError)
	io.WriteString(w, "Unimplemented")
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
		panic(err)
	}

	// TODO: config schema
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		panic(err)
	}

	listenAddr := fmt.Sprintf("%s:%d", *serverHost, *serverPort)
	http.HandleFunc("/healthz", healthz)
	http.HandleFunc("/records", records)
	http.HandleFunc("/servers", servers)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
