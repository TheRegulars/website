package rcon

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
const maxEmptyReads = 20
var invalidInputError = errors.New("Invalid input")

type readProcessor struct {
	stream io.Reader
	buf    []byte
	cur    int
	mar    int
	tok    int
	lim    int
	eof    bool
	err    error
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
	if p.tok == 0 && p.lim == BUFSIZE {
		log.Println("BUFSIZE in read processors is too small")
		return false
	}
	copy(p.buf[0:], p.buf[p.tok:p.lim])
	p.cur -= p.tok
	p.mar -= p.tok
	p.lim -= p.tok
	/*!stags:re2c format = "\tif p.@@ != -1 { p.@@ -= p.tok }\n"; */
	p.tok = 0
	for i := 0; i < maxEmptyReads; i++ {
		n, err := p.stream.Read(p.buf[p.lim:BUFSIZE])
		if err != nil {
			if err == io.EOF {
				p.eof = true
			} else {
				p.err = err
				return false
			}
		}
		if n > 0 {
			p.lim += n
			p.buf[p.lim] = 0
			return true
		}
		if p.eof {
			return false
		}
	}
	log.Printf("Read processor got %d empty reads in a row", maxEmptyReads)
	return false
}

// errOr returns the read error that cut the input short, if any, and e otherwise.
func (p *readProcessor) errOr(e error) error {
	if p.err != nil {
		return p.err
	}
	return e
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
	/*!re2c
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
	* { return nil, genErr1(p.errOr(invalidInputError)) }
	$ { return nil, genErr1(p.errOr(io.EOF)) }
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
	* { return &stats, genErr2(p.errOr(invalidInputError)) }
	$ { return &stats, genErr2(p.errOr(io.EOF)) }
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
	* { return &stats, genErr3(p.errOr(invalidInputError)) }
	$ { return &stats, genErr3(p.errOr(io.EOF)) }
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
	/*!re2c
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

	* { return &status, genSvPublicError(p.errOr(invalidInputError)) }
	$ { return &status, genSvPublicError(p.errOr(io.EOF)) }
	*/
host:
	p.tok = p.cur
	/*!re2c
	"host:     " @ss .* @se "\n" {
		status.Hostname = strings.TrimSpace(string(p.buf[ss:se]))
		goto version
	}
	* { return &status, genHostError(p.errOr(invalidInputError)) }
	$ { return &status, genHostError(p.errOr(io.EOF)) }
	*/
version:
	p.tok = p.cur
	/*!re2c
	"version:" space+ @ss .* @se "\n" {
		status.Version = strings.TrimSpace(string(p.buf[ss:se]))
		goto protocol
	}
	* { return &status, genVersionError(p.errOr(invalidInputError)) }
	$ { return &status, genVersionError(p.errOr(io.EOF)) }
	*/
protocol:
	p.tok = p.cur
	/*!re2c
	"protocol:" space+ @ss .* @se "\n" {
		status.Protocol = strings.TrimSpace(string(p.buf[ss:se]))
		goto mapPrefix
	}
	* { return &status, genProtocolError(p.errOr(invalidInputError)) }
	$ { return &status, genProtocolError(p.errOr(io.EOF)) }
	*/
mapPrefix:
	p.tok = p.cur
	/*!re2c
	"map:" space+ @ss .* @se "\n" {
		status.Map = strings.TrimSpace(string(p.buf[ss:se]))
		goto timing
	}
	* { return &status, genMapError(p.errOr(invalidInputError)) }
	$ { return &status, genMapError(p.errOr(io.EOF)) }
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
	* { return &status, genTimingError("CPU", p.errOr(invalidInputError)) }
	$ { return &status, genTimingError("CPU", p.errOr(io.EOF)) }
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
	* { return &status, genTimingError("lost", p.errOr(invalidInputError)) }
	$ { return &status, genTimingError("lost", p.errOr(io.EOF)) }
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
	* { return &status, genTimingError("OffsetAvg", p.errOr(invalidInputError)) }
	$ { return &status, genTimingError("OffsetAvg", p.errOr(io.EOF)) }
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
	* { return &status, genTimingError("MaxOffset", p.errOr(invalidInputError)) }
	$ { return &status, genTimingError("MaxOffset", p.errOr(io.EOF)) }
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
	* { return &status, genTimingError("Sdev", p.errOr(invalidInputError)) }
	$ { return &status, genTimingError("Sdev", p.errOr(io.EOF)) }
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
	* { return &status, genPlayersError("active", p.errOr(invalidInputError)) }
	$ { return &status, genPlayersError("active", p.errOr(io.EOF)) }
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
	* { return &status, genPlayersError("max", p.errOr(invalidInputError)) }
	$ { return &status, genPlayersError("max", p.errOr(io.EOF)) }
	*/
playersHeader:
	p.tok = p.cur
	/*!re2c
	.* "\n^2IP" space+ "%pl".*"\n" { goto parsePlayers }
	* { return &status, fmt.Errorf("Error in players header, %w", p.errOr(invalidInputError)) }
	$ { return &status, fmt.Errorf("Error in players header, %w", p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
		* { return &status, genError(p.errOr(invalidInputError)) }
		$ { return &status, genError(p.errOr(io.EOF)) }
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
	* { return nil, genError(p.errOr(invalidInputError)) }
	$ { return nil, genError(p.errOr(io.EOF)) }
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
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
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
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
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
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
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
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
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
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
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
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
	*/
scoreString:
	genError = func(e error) error {
		return fmt.Errorf("Failed parsing score string %w", e)
	}
	p.tok = p.cur
	/*!re2c
	@ss .+ @se {
		info.ScoreString = string(p.buf[ss:se])
		goto done
	}
	* { return &info, genError(p.errOr(invalidInputError)) }
	$ { return &info, genError(p.errOr(io.EOF)) }
	*/
done:
	return &info, nil
}

func ParseScores(r io.Reader) (*ServerScores, error) {
	var scores ServerScores
	var as, ae, bs, be, cs, ce, ds, de, es, ee int

	p := newReadProcessor(r)
	genError := func(e error) error {
		return fmt.Errorf("Error parsing scores: %w", e)
	}
	scores.TeamScores = make(map[int][]int64)
	scores.Players = []PlayerScores{}
	for {
		p.tok = p.cur
		/*!re2c
		(!"^7")? ":status:" @as [^_]+ @ae "_" @bs [^:]+ @be ":" @cs  num @ce "\n" {
			scores.Gametype = string(p.buf[as:ae])
			scores.Map = string(p.buf[bs:be])
			val, err := strconv.ParseInt(string(p.buf[cs:ce]), 10, 64)
			if err != nil {
				return nil, genError(err)
			}
			scores.GameTime = uint64(val)
			continue
		}
		(!"^7")? ":labels:player:" @as .+ @ae "\n" {
			scores.PlayerLabels = strings.Split(strings.TrimSpace(string(p.buf[as:ae])), ",")
			continue
		}
		(!"^7")? ":labels:teamscores:" @as .+ @ae "\n" {
			scores.TeamLabels = strings.Split(strings.TrimSpace(string(p.buf[as:ae])), ",")
			continue
		}
		(!"^7")? ":player:see-labels:" @as [^:]+ @ae ":" @bs num @be ":" @cs ("spectator" | "-"? num) @ce ":"
		@ds num @de ":" @es .+ @ee "\n" {
			// player scores : playing time : player team : player id : player name
			// https://github.com/xonotic/xonotic-data.pk3dir/blob/cc84ebedeb4523efb23fa8c5dd1e703cd0434a23/qcsrc/server/world.qc#L1255
			// since console and eventlog outputs using different format
			var player PlayerScores
			pScores := strings.Split(strings.TrimSpace(string(p.buf[as:ae])), ",")
			for _, v := range pScores {
				sVal, err := strconv.ParseFloat(v, 64)
				if err != nil {
					return nil, genError(err)
				}
				player.Scores = append(player.Scores, sVal)
			}
			iVal, err := strconv.ParseInt(string(p.buf[bs:be]), 10, 64)
			if err != nil {
				return nil, genError(err)
			}
			player.PlayingTime = iVal
			team := strings.TrimSpace(string(p.buf[cs:ce]))
			if team == "spectator" {
				player.Team = -666
			} else {
				iVal, err := strconv.ParseInt(team, 10, 32)
				if err != nil {
					return nil, genError(err)
				}
				player.Team = int32(iVal)
			}
			iVal, err = strconv.ParseInt(strings.TrimSpace(string(p.buf[ds:de])), 10, 32)
			if err != nil {
				return nil, genError(err)
			}
			player.PlayerId = int32(iVal)
			player.Name = strings.TrimSpace(string(p.buf[es:ee]))
			scores.Players = append(scores.Players, player)
			continue
		}
		(!"^7")? ":teamscores:see-labels:" @as [0-9,-]* @ae ":" @bs [0-9]* @be "\n" {
			var teamScores []int64

			if as == ae {
				// scores is empty
				continue
			}

			teamScoresStr := strings.Split(strings.TrimSpace(string(p.buf[as:ae])), ",")
			for _, item := range teamScoresStr {
				val, err := strconv.ParseInt(item, 10, 64)
				if err != nil {
					return nil, genError(err)
				}
				teamScores = append(teamScores, val)
			}
			teamId, err := strconv.ParseInt(string(p.buf[bs:be]), 10, 64)
			if err != nil {
				return nil, genError(err)
			}
			scores.TeamScores[int(teamId)] = teamScores
			continue
		}
		(!"^7")? ":end\n" {
			return &scores, nil
		}
		* { return &scores, genError(p.errOr(invalidInputError)) }
		$ { return &scores, genError(p.errOr(io.EOF))}
		*/
	}
	return &scores, nil
}
