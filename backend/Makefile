.PHONY: clean test fuzz-memstats fuzz-status bench default

GO_FILES = $(wildcard *.go)
FILES = ${GO_FILES} go.mod go.sum rcon_parser.re rcon_parser.go

default: backend

rcon_parser.go: rcon_parser.re
	re2go rcon_parser.re --tags -W -o rcon_parser.go -i

backend: ${FILES}
	go build -o backend ./

test: ${FILES}
	go test ./

fuzz-memstats: ${FILES}
	go test -fuzz=FuzzParseMemstats ./

fuzz-status: ${FILES}
	go test -fuzz=FuzzParseStatus ./

bench: ${FILES}
	go test -bench=. ./

clean:
	@rm -f backend
