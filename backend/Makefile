.PHONY: clean test fuzz-memstats fuzz-status bench default

RE2GO ?= re2go
GO_FILES = $(wildcard cmd/*.go pkg/**/*.go)
RE_FILES = $(wildcard pkg/**/*.re)
GENERATED_RE_FILES = $(RE_FILES:%.re=%.go)
FILES = ${GO_FILES} ${RE_FILES} ${GENERATED_RE_FILES} go.mod go.sum

default: backend

my:
	echo ${GENERATED_RE_FILES}

${GENERATED_RE_FILES}: ${RE_FILES}
	$(RE2GO) $< --tags -W -o $@ -i

backend: ${FILES}
	go build -o backend ./cmd/

test: ${FILES}
	go test ./pkg/rcon/

fuzz-memstats: ${FILES}
	go test -fuzz=FuzzParseMemstats ./pkg/rcon/

fuzz-status: ${FILES}
	go test -fuzz=FuzzParseStatus ./pkg/rcon/

bench: ${FILES}
	go test -bench=. ./pkg/rcon/

clean:
	@rm -f ${GENERATED_RE_FILES}
	@rm -f backend
