package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"strconv"
	"strings"
	"net/url"
)

const BUFSIZE = 4096
var invalidInputError = errors.New("Invalid input")

type readProcessor struct {
	stream io.Reader
	buf    []byte
	cur    int
	mar    int
	tok    int
	lim    int
	eof    bool
	/*!stags:re2c format = "\t@@ int\n"; */
}

func newReadProcessor(r io.Reader) *readProcessor {
	// TODO: maybe add err
	return &readProcessor{
		stream: r,
		buf:    make([]byte, BUFSIZE+1),
		cur:    BUFSIZE,
		mar:    BUFSIZE,
		tok:    BUFSIZE,
		lim:    BUFSIZE,
		eof:    false,
		/*!stags:re2c format = "\t\t@@: -1,\n"; */
	}
}

func fillReadProcessor(p *readProcessor) bool {
	if p.eof {
		return false
	}
	// BUFSIZE is too small
	if p.tok < 1 {
		log.Println("BUFFSIZE in read processors is too small")
		return false
	}
	copy(p.buf[0:], p.buf[p.tok:p.lim])
	p.cur -= p.tok
	p.mar -= p.tok
	p.lim -= p.tok
	/*!stags:re2c format = "\tif p.@@ != -1 { p.@@ -= p.tok }\n"; */
	p.tok = 0
	n, err := p.stream.Read(p.buf[p.lim:BUFSIZE])
	if err != nil {
		if err == io.EOF {
			p.eof = true
		} else {
			return false
		}
	}
	if n > 0 {
		p.lim += n
		p.buf[p.lim] = 0
		return true
	}
	return !p.eof
}

func ParseMemstats(r io.Reader) (*ServerMemstats, error) {
	var stats ServerMemstats
	var ss, se int
	p := newReadProcessor(r)
	genErr1 := func(e error) error {
		return fmt.Errorf("Failed parsing memory pools with: %w", e)
	}
	genErr2 := func(e error) error {
		return fmt.Errorf("Failed parsing totalling memory with: %w", e)
	}
	genErr3 := func(e error) error {
		return fmt.Errorf("Failed parsing allocated memory with: %w", e)
	}
	p.tok = p.cur
	/*!re2c:memstats
	re2c:define:YYCTYPE		 = byte;
	re2c:define:YYPEEK		 = "p.buf[p.cur]";
	re2c:define:YYSKIP		 = "p.cur += 1";
	re2c:define:YYLESSTHAN	 = "p.lim <= p.cur";
	re2c:define:YYBACKUP	 = "p.mar = p.cur";
	re2c:define:YYRESTORE	 = "p.cur = p.mar";
	re2c:define:YYSHIFT		 = "p.cur += @@{shift}";
	re2c:define:YYSTAGP		 = "@@{tag} = p.cur";
	re2c:define:YYSTAGN		 = "@@{tag} = -1";
	re2c:define:YYSHIFTSTAG  = "@@{tag} += @@{shift}";
	re2c:tags:expression	 = "p.@@";
	re2c:define:YYFILL		 = "fillReadProcessor(p)";
	re2c:yyfill:enable		 = 1;
	re2c:eof				 = 0;

	digit = [0-9];
	num = digit+;
	signum = "-"?num;

	@ss num @se " memory pools," {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return nil, genErr1(err)
		}
		stats.PoolsCount = int32(val)
		goto total
	}
	* { return nil, genErr1(invalidInputError) }
	$ { return nil, genErr1(io.EOF) }
	*/
total:
	p.tok = p.cur
	/*!re2c
	" totalling " @ss num @se " bytes " .* "\n" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return nil, genErr2(err)
		}
		stats.PoolsTotal = val
		goto allocated
	}
	* { return &stats, genErr2(invalidInputError) }
	$ { return &stats, genErr2(io.EOF) }
	*/
allocated:
	p.tok = p.cur
	/*!re2c
	"total allocated size: " @ss num @se " bytes ".*"\n" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return &stats, genErr3(err)
		}
		stats.TotalAllocatedSize = val
		return &stats, nil
	}
	* { return &stats, genErr3(invalidInputError) }
	$ { return &stats, genErr3(io.EOF) }
	*/
	return nil, errors.New("Reached impossible state")
}

func ParseStatus(r io.Reader) (*ServerStatus, error) {
	var status ServerStatus
	var ss, se int

	p := newReadProcessor(r)
	genSvPublicError := func(e error) error {
		return fmt.Errorf("Failed parsing sv_public with %w", e)
	}
	genHostError := func(e error) error {
		return fmt.Errorf("Failed parsing host with %w", e)
	}
	genVersionError := func(e error) error {
		return fmt.Errorf("Failed parsing version with %w", e)
	}
	genProtocolError := func(e error) error {
		return fmt.Errorf("Failed parsing protocol with %w", e)
	}
	genMapError := func(e error) error {
		return fmt.Errorf("Failed parsing protocol with %w", e)
	}
	genTimingError := func(str string, e error) error {
		return fmt.Errorf("Failed parsing %s timing with %w", str, e)
	}
	genPlayersError := func(str string, e error) error {
		return fmt.Errorf("Failed parsing %s players with %w", str, e)
	}

	p.tok = p.cur
	/*!re2c:status
	space = [ \t];
	float = "-"? digit+("." digit*)?;

	["]"sv_public"["]" is "["] @ss signum @se ["].*"\n" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 32)
		if err != nil {
			return &status, genSvPublicError(err)
		}
		status.Public = int32(val)
		goto host
	}

    * { fmt.Println(string(p.buf[p.cur:])); return &status, genSvPublicError(invalidInputError) }
	$ { return &status, genSvPublicError(io.EOF) }
	*/
host:
	p.tok = p.cur
	/*!re2c
	"host:     " @ss .* @se "\n" {
		status.Hostname = strings.TrimSpace(string(p.buf[ss:se]))
		goto version
	}
	* { return &status, genHostError(invalidInputError) }
	$ { return &status, genHostError(io.EOF) }
	*/
version:
	p.tok = p.cur
	/*!re2c
	"version:" space+ @ss .* @se "\n" {
		status.Version = strings.TrimSpace(string(p.buf[ss:se]))
		goto protocol
	}
	* { return &status, genVersionError(invalidInputError) }
	$ { return &status, genVersionError(io.EOF) }
	*/
protocol:
	p.tok = p.cur
	/*!re2c
	"protocol:" space+ @ss .* @se "\n" {
		status.Protocol = strings.TrimSpace(string(p.buf[ss:se]))
		goto mapPrefix
	}
	* { return &status, genProtocolError(invalidInputError) }
	$ { return &status, genProtocolError(io.EOF) }
	*/
mapPrefix:
	p.tok = p.cur
	/*!re2c
	"map:" space+ @ss .* @se "\n" {
		status.Map = strings.TrimSpace(string(p.buf[ss:se]))
		goto timing
	}
	* { return &status, genMapError(invalidInputError) }
	$ { return &status, genMapError(io.EOF) }
	*/
timing:
	p.tok = p.cur
	/*!re2c
	"timing:" space+ @ss float @se "%" space+ {
		f, err := strconv.ParseFloat(string(p.buf[ss:se]), 64)
		if err != nil {
			return &status, genTimingError("CPU", err)
		}
		status.Timing.CPU = f
		goto timingLost
	}
	* { return &status, genTimingError("CPU", invalidInputError) }
	$ { return &status, genTimingError("CPU", io.EOF) }
	*/
timingLost:
	p.tok = p.cur
	/*!re2c
	'CPU,' space+ @ss float @se "%" space+ "lost," space+ {
		f, err := strconv.ParseFloat(string(p.buf[ss:se]), 64)
		if err != nil {
			return &status, genTimingError("lost", err)
		}
		status.Timing.Lost = f
		goto timingAvg
	}
	* { return &status, genTimingError("lost", invalidInputError) }
	$ { return &status, genTimingError("lost", io.EOF) }
	*/
timingAvg:
	p.tok = p.cur
	/*!re2c
	"offset avg" space+ @ss float @se "ms," space+ {
		f, err := strconv.ParseFloat(string(p.buf[ss:se]), 64)
		if err != nil {
			return &status, genTimingError("OffsetAvg", err)
		}
		status.Timing.OffsetAvg = f
		goto timingMax
	}
	* { return &status, genTimingError("OffsetAvg", invalidInputError) }
	$ { return &status, genTimingError("OffsetAvg", io.EOF) }
	*/
timingMax:
	p.tok = p.cur
	/*!re2c
	"max" space+ @ss float @se "ms," space+ {
		f, err := strconv.ParseFloat(string(p.buf[ss:se]), 64)
		if err != nil {
			return &status, genTimingError("MaxOffset", err)
		}
		status.Timing.OffsetMax = f
		goto timingSdev
	}
	* { return &status, genTimingError("MaxOffset", invalidInputError) }
	$ { return &status, genTimingError("MaxOffset", io.EOF) }
	*/
timingSdev:
	p.tok = p.cur
	/*!re2c
	"sdev" space+ @ss float @se "ms" .* "\n" {
		f, err := strconv.ParseFloat(string(p.buf[ss:se]), 64)
		if err != nil {
			return &status, genTimingError("Sdev", err)
		}
		status.Timing.OffsetSdev = f
		goto players
	}
	* { return &status, genTimingError("Sdev", invalidInputError) }
	$ { return &status, genTimingError("Sdev", io.EOF) }
	*/
players:
	p.tok = p.cur
	/*!re2c
	"players:" space+ @ss num @se space+ "active" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return &status, genPlayersError("active", err)
		}
		status.PlayersActive = val
		goto playersMax
	}
	* { return &status, genPlayersError("active", invalidInputError) }
	$ { return &status, genPlayersError("active", io.EOF) }
	*/
playersMax:
	p.tok = p.cur
	/*!re2c
	space+ "(" @ss num @se space+ "max)".* "\n" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return &status, genPlayersError("max", err)
		}
		status.PlayersMax = val
		if status.PlayersActive > 0 {
			goto playersHeader
		}
		return &status, nil
	}
	* { return &status, genPlayersError("max", invalidInputError) }
	$ { return &status, genPlayersError("max", io.EOF) }
	*/
playersHeader:
	p.tok = p.cur
	/*!re2c
	.* "\n^2IP" space+ "%pl".*"\n" { goto parsePlayers }
	* { return &status, fmt.Errorf("Invalid input in players header, %w", invalidInputError) }
	$ { return &status, fmt.Errorf("Error in players header, %w", io.EOF) }
	*/
parsePlayers:
	for i := int64(0); i < status.PlayersActive; i++ {
		var player Player
		p.tok = p.cur
		genError := func(e error) error {
			return fmt.Errorf("Error parsing player IP: %w", e)
		}
		/*!re2c
		"^"[37] @ss [^ \t]+ @se / space {
			player.IP = strings.TrimSpace(string(p.buf[ss:se]))
			player.IsBot = player.IP == "botclient"
			goto playerPL
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerPL:
		p.tok = p.cur
		genError = func(e error) error {
			return fmt.Errorf("Error parsing player PL: %w", e)
		}
		/*!re2c
		space+ @ss signum @se / space {
			val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
			if err != nil {
				return &status, genError(err)
			}
			player.PL = val
			goto playerPing
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerPing:
		p.tok = p.cur
		genError = func(e error) error {
			return fmt.Errorf("Error parsing player Ping: %w", e)
		}
		/*!re2c
		space+ @ss signum @se / space {
			val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
			if err != nil {
				return &status, genError(err)
			}
			player.Ping = val
			goto playerTime
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerTime:
		p.tok = p.cur
		genError = func(e error) error {
			return fmt.Errorf("Error parsing player time: %w", e)
		}
		/*!re2c
		space+ @ss [0123456789:]+ @se / space {
			player.Time = strings.TrimSpace(string(p.buf[ss:se]))
			goto playerFrags
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerFrags:
		p.tok = p.cur
		genError = func(e error) error {
			return fmt.Errorf("Error parsing player frags: %w", e)
		}
		/*!re2c
		space+ @ss signum @se / space {
			val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
			if err != nil {
				return &status, genError(err)
			}
			player.Frags = val
			goto playerNumber
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerNumber:
		p.tok = p.cur
		genError = func(e error) error {
			return fmt.Errorf("Error parsing player number: %w", e)
		}
		/*!re2c
		space+ "#" @ss num @se / space {
			val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 32)
			if err != nil {
				return &status, genError(err)
			}
			player.Number = int32(val)
			goto playerName
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerName:
		p.tok = p.cur
		genError = func(e error) error {
			return fmt.Errorf("Error parsing player name: %w", e)
		}
		/*!re2c
		space+ @ss .* @se "\n" {
			player.Name = string(p.buf[ss:se])
			status.Players = append(status.Players, player)
			goto playerNew
		}
		* { return &status, genError(invalidInputError) }
		$ { return &status, genError(io.EOF) }
		*/
	playerNew:
	}
	return &status, nil
}

func ParseServerInfo(r io.Reader) (*ServerInfo, error) {
	var info ServerInfo
	var ss, se int

	p := newReadProcessor(r)
	genError := func(e error) error {
		return fmt.Errorf("Failed parsing gametype with %w", e)
	}
	p.tok = p.cur
	/*!re2c
	@ss [^:\n]+ @se ":" {
		info.Gametype = strings.ToLower(string(p.buf[ss:se]))
		goto gameVersion
	}
	* { return nil, genError(invalidInputError) }
	$ { return nil, genError(io.EOF) }
	*/
gameVersion:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing game version with %w", e)
	}
	p.tok = p.cur
	/*!re2c
	@ss [^:\n]+ @se ":" {
		info.Version = strings.ToLower(string(p.buf[ss:se]))
		goto pureChanges
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
pureChanges:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing pure changes with %w", e)
	}
	p.tok = p.cur
	/*!re2c
	"P" @ss num @se ":" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return &info, genError(err)
		}
		info.PureChangesCount = val
		goto joinAllowed
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
joinAllowed:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing join allowed count with %w", e)
	}
	p.tok = p.cur
	/*!re2c
	"S" @ss num @se ":" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 64)
		if err != nil {
			return &info, genError(err)
		}
		info.JoinAllowedCount = val
		goto serverFlags
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
serverFlags:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing server flags with %w", e)
	}
	p.tok = p.cur
	/*!re2c
	"F" @ss num @se ":" {
		val, err := strconv.ParseInt(string(p.buf[ss:se]), 10, 32)
		if err != nil {
			return &info, genError(err)
		}
		info.ServerFlags = int32(val)
		goto termsOfService
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
termsOfService:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing terms of service %w", e)
	}
	p.tok = p.cur
	/*!re2c
	"T" @ss [^:\n]+ @se ":" {
		encodedUrl := strings.ToLower(string(p.buf[ss:se]))
		if encodedUrl != "invalid" {
			unescaped, err := url.PathUnescape(encodedUrl)
			if err != nil {
				return &info, genError(err)
			}
			info.TermsOfServiceURL = unescaped
		} else {
			info.TermsOfServiceURL = ""
		}
		goto modName
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
modName:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing mod name %w", e)
	}
	p.tok = p.cur
	/*!re2c
	"M" @ss [^:\n]+ @se "::" {
		info.ModName = string(p.buf[ss:se])
		goto scoreString
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
scoreString:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing score string %w", e)
	}
	p.tok = p.cur
	/*!re2c
	@ss .* @se {
		info.ScoreString = string(p.buf[ss:se])
		goto done
	}
	* { return &info, genError(invalidInputError) }
	$ { return &info, genError(io.EOF) }
	*/
done:
	return &info, nil
}
