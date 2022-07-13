package main

import (
	"strings"
	"testing"
)

var emptyServer string = `"sv_public" is "1" ["1"]
host:     [力] TheRegulars ☠ Instagib Server [git]
version:  Xonotic build 12:58:11 Oct  6 2019 - (gamename Xonotic)
protocol: 3504 (DP7)
map:      dusty_v2r1
timing:   0.3% CPU, 0.00% lost, offset avg 0.0ms, max 0.1ms, sdev 0.0ms
players:  0 active (24 max)

^2IP                                             %pl ping  time   frags  no   name`

var fullServer string = `"sv_public" is "-1" ["-1"]
host:      [力] TheRegulars ☠ Instagib Server [git]
version:  Xonotic build 12:58:11 Oct  6 2019 - (gamename Xonotic)
protocol: 3504 (DP7)
map:      dusty_v2r1
timing:   0.3% CPU, 0.01% lost, offset avg 0.2ms, max 0.11ms, sdev 0.02ms
players:  6 active (24 max)

^2IP                                             %pl ping  time   frags  no   name
^3botclient                                        0   70  0:04:22     42  #1   bot1
^7127.0.0.1:39707                                  0   68  1:30:21   -666  #2   Player1
^3127.0.0.2:60812                                  0   40  0:00:43      2  #3   Player2
^7[3b04:4c9:127:7511:8:0:0:16]:38914               0   41  0:18:06     83  #10  Player3
^3[2001:4:211:7466:271c:2345:abcd:ef01]:56338      0   58  3:13:22   -666  #12  Player4
^7local                                            0   68  0:04:11   -666  #13  Player5
`

var memstatsRcon string = `286 memory pools, totalling 352844962 bytes (336.499MB)
total allocated size: 1180312470 bytes (1125.634MB)
`

var worldstatus string = `nb:git:P19:S11:F3:TINVALID:MXPM::goals!!:goals!!:5:0:14:0`

func TestParseStatusEmpty(t *testing.T) {
	reader := strings.NewReader(emptyServer)
	status, err := ParseStatus(reader)
	if err != nil {
		t.Error("Error during parsing server response ", err)
	}

	if status.Public != 1 {
		t.Error("Incorrect status result ", status)
	}

	if status.Map != "dusty_v2r1" {
		t.Error("Incorrect map name ", status)
	}

	if status.Hostname != "[力] TheRegulars ☠ Instagib Server [git]" {
		t.Error("Incorrect hostname ", status)
	}

	if status.Timing.CPU != 0.3 {
		t.Error("Incorrect cpu timing ", status)
	}

	if status.Timing.OffsetSdev != 0.0 {
		t.Error("Incorrect sdev timing ", status)
	}

	if status.PlayersMax != 24 {
		t.Error("Incorrect max players ", status)
	}

	if status.Version != "Xonotic build 12:58:11 Oct  6 2019 - (gamename Xonotic)" {
		t.Error("Incorrect version", status)
	}

	if status.Protocol != "3504 (DP7)" {
		t.Error("Incorrect protocol", status)
	}
	if len(status.Players) != 0 {
		t.Error("Incorrect players count", status)
	}
}

func TestParseStatusFull(t *testing.T) {
	var p Player
	reader := strings.NewReader(fullServer)
	status, err := ParseStatus(reader)
	if err != nil {
		t.Error("Error during parsing server response ", err)
	}
	if status.Public != -1 {
		t.Error("Incorrect status result ", status)
	}
	if status.PlayersActive != 6 || len(status.Players) != 6 {
		t.Error("Incorrect number of players ", status)
	}
	p = status.Players[0]
	if !p.IsBot || p.Name != "bot1" || p.Ping != 70 {
		t.Error("Incorrectly parsed first player ", p)
	}
	p = status.Players[1]
	if p.IP != "127.0.0.1:39707" || p.Name != "Player1" || p.Frags != -666 || p.Number != 2 {
		t.Error("Incorrectly parsed second player ", p)
	}
	p = status.Players[3]
	if p.IP != "[3b04:4c9:127:7511:8:0:0:16]:38914" || p.Name != "Player3" || p.Number != 10 {
		t.Error("Incorrectly parsed 4 player ", p)
	}
	p = status.Players[4]
	if p.IP != "[2001:4:211:7466:271c:2345:abcd:ef01]:56338" || p.Name != "Player4" || p.Time != "3:13:22" {
		t.Error("Incorrectly parsed 5 player ", p)
	}
	p = status.Players[5]
	if p.IP != "local" || p.PL != 0 || p.Frags != -666 || p.Name != "Player5" || p.Number != 13 {
		t.Error("Incorrectly parsed 6 player ", p)
	}
}

func TestParseMemstats(t *testing.T) {
	reader := strings.NewReader(memstatsRcon)
	memstats, err := ParseMemstats(reader)

	if err != nil {
		t.Error("Error during parsing ", err)
	}

	if memstats.PoolsCount != 286 {
		t.Error("Pools count was parsed incorrectly ", memstats.PoolsCount)
	}

	if memstats.PoolsTotal != 352844962 {
		t.Error("Pools totalling was parsed incorrectly ", memstats.PoolsTotal)
	}

	if memstats.TotalAllocatedSize != 1180312470 {
		t.Error("Total allocated size was parsed incorrectly ", memstats.TotalAllocatedSize)
	}
}

func TestParseInfo(t *testing.T) {
	reader := strings.NewReader(worldstatus)
	info, err := ParseServerInfo(reader)
	if err != nil {
		t.Error("Error during parsing ", err)
	}
	if info.Gametype != "nb" || info.Version != "git" || info.PureChangesCount != 19 {
		t.Error("Incorrectly parsed ServerInfo ", info)
	}
	if info.JoinAllowedCount != 11 || info.ServerFlags != 3 || info.TermsOfServiceURL != "" {
		t.Error("Incorrectly parsed ServerInfo ", info)
	}
	if info.ModName != "XPM" || info.ScoreString != "goals!!:goals!!:5:0:14:0" {
		t.Error("Incorrectly parsed ServerInfo ", info)
	}
}

func FuzzParseMemstats(f *testing.F) {
	f.Add(memstatsRcon)

	f.Fuzz(func(t *testing.T, in string) {
		reader := strings.NewReader(in)
		ParseMemstats(reader)
	})
}

func FuzzParseStatus(f *testing.F) {
	f.Add(emptyServer)
	f.Add(fullServer)

	f.Fuzz(func(t *testing.T, in string) {
		reader := strings.NewReader(in)
		ParseStatus(reader)
	})
}

func BenchmarkParseMemstats(b *testing.B) {
	for i := 0; i < b.N; i++ {
		reader := strings.NewReader(memstatsRcon)
		ParseMemstats(reader)
	}
}

func BenchmarkParseStatus(b *testing.B) {
	for i := 0; i < b.N; i++ {
		ParseStatus(strings.NewReader(emptyServer))
		ParseStatus(strings.NewReader(fullServer))
	}
}
