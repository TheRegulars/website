.PHONY: clean

GO_FILES = $(wildcard *.go)

backend: ${GO_FILES} go.mod go.sum
	go build -o backend ./

clean:
	@rm -f backend
