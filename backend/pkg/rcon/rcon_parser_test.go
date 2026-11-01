package rcon

import (
	"io"
	"reflect"
	"strings"
	"testing"
	"testing/iotest"
)

// packetReader returns at most size bytes per Read, like rconReader does with
// DarkPlaces rcon packets.
type packetReader struct {
	r    io.Reader
	size int
}

func (p *packetReader) Read(b []byte) (int, error) {
	if len(b) > p.size {
		b = b[:p.size]
	}
	return p.r.Read(b)
}

// emptyReads returns (0, nil) before every real read.
type emptyReads struct {
	r     io.Reader
	empty bool
}

func (e *emptyReads) Read(b []byte) (int, error) {
	if e.empty = !e.empty; e.empty {
		return 0, nil
	}
	return e.r.Read(b)
}

func TestParsersWithShortReads(t *testing.T) {
	readers := []struct {
		name string
		wrap func(io.Reader) io.Reader
	}{
		{"OneByteReader", iotest.OneByteReader},
		{"HalfReader", iotest.HalfReader},
		{"DataErrReader", iotest.DataErrReader},
		{"packets", func(r io.Reader) io.Reader { return &packetReader{r, 1394} }},
		{"empty reads", func(r io.Reader) io.Reader { return &emptyReads{r: r} }},
	}
	for _, p := range []struct {
		name  string
		input string
		parse func(io.Reader) (any, error)
	}{
		{"status", fullServer, func(r io.Reader) (any, error) { return ParseStatus(r) }},
		{"memstats", memstatsRcon, func(r io.Reader) (any, error) { return ParseMemstats(r) }},
		{"info", worldstatus, func(r io.Reader) (any, error) { return ParseServerInfo(r) }},
		{"scores", playerScores, func(r io.Reader) (any, error) { return ParseScores(r) }},
	} {
		want, err := p.parse(strings.NewReader(p.input))
		if err != nil {
			t.Fatalf("%s: %v", p.name, err)
		}
		for _, r := range readers {
			t.Run(p.name+"/"+r.name, func(t *testing.T) {
				got, err := p.parse(r.wrap(strings.NewReader(p.input)))
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got, want) {
					t.Errorf("got %+v, want %+v", got, want)
				}
			})
		}
	}
}

func TestParseLineSpanningPackets(t *testing.T) {
	labels := strings.TrimSuffix(strings.Repeat("kills,", 500), ",")
	input := ":labels:player:" + labels + "\n:end\n"
	scores, err := ParseScores(&packetReader{strings.NewReader(input), 1394})
	if err != nil {
		t.Fatal(err)
	}
	if len(scores.PlayerLabels) != 500 {
		t.Errorf("Got %d player labels, want 500", len(scores.PlayerLabels))
	}
}

func TestParseLineLongerThanBuffer(t *testing.T) {
	input := ":labels:player:" + strings.Repeat("x", BUFSIZE) + "\n:end\n"
	if _, err := ParseScores(strings.NewReader(input)); err == nil {
		t.Error("ParseScores() succeeded, want an error")
	}
}

// endlessEmptyReader only returns (0, nil). It fails after 1000 calls, so a
// parser that never gives up can't hang the test.
type endlessEmptyReader struct {
	calls int
}

func (r *endlessEmptyReader) Read([]byte) (int, error) {
	r.calls++
	if r.calls > 1000 {
		return 0, io.ErrNoProgress
	}
	return 0, nil
}

func TestParseGivesUpOnEmptyReads(t *testing.T) {
	r := &endlessEmptyReader{}
	if _, err := ParseStatus(r); err == nil {
		t.Error("ParseStatus() succeeded, want an error")
	}
	if r.calls != maxEmptyReads {
		t.Errorf("Read was called %d times, want %d", r.calls, maxEmptyReads)
	}
}
