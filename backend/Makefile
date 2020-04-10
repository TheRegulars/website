.PHONY: clean test

GO_FILES = $(wildcard *.go)
FILES = ${GO_FILES} go.mod go.sum

backend: ${FILES}
	go build -o backend ./

test: ${FILES}
	go test ./

clean:
	@rm -f backend
