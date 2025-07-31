package main

import (
	"net"
	"net/http"
	"net/http/pprof"
)

func ListenPProf(sockPath string) {
	sock, err := net.Listen("unix", sockPath)
	if err != nil {
		panic(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/debug/pprof/", http.HandlerFunc(pprof.Index))
	mux.Handle("/debug/pprof/cmdline", http.HandlerFunc(pprof.Cmdline))
	mux.Handle("/debug/pprof/profile", http.HandlerFunc(pprof.Profile))
	mux.Handle("/debug/pprof/symbol", http.HandlerFunc(pprof.Symbol))
	mux.Handle("/debug/pprof/trace", http.HandlerFunc(pprof.Trace))
	go http.Serve(sock, mux)
}
