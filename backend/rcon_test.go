package main

import (
	"bufio"
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

var memstatsRcon string = `286 memory pools, totalling 352844962 bytes (336.499MB)
total allocated size: 1180312470 bytes (1125.634MB)
`

func TestParsePlayer(t *testing.T) {
	var player Player

	line := "^3botclient                                        0    0  0:00:07    0  #2   ^7[BOT]Toxic"
	err := parseRconPlayer([]byte(line), &player)
	if err != nil {
		t.Error("Error during parsing ", err)
	}

	if player.IP != "botclient" || player.Number != 2 || player.Name != "[BOT]Toxic" {
		t.Error("Player was parsed incorrectly ", player)
	}
	line = "^3127.0.0.1:5050   0   67  0:13:24 -666  #7   ^7^xBBFCovid-9 Antivirus  ^x7E0▲^7"
	err = parseRconPlayer([]byte(line), &player)
	if err != nil {
		t.Error("Error during parsing ", err)
	}
	if player.IP != "127.0.0.1:5050" || player.Ping != 67 || player.Frags != -666 {
		t.Error("Player was parse incorrectly ", player)
	}
}

func TestParseRconStatus(t *testing.T) {
	var status ServerStatus

	scanner := bufio.NewScanner(strings.NewReader(emptyServer))
	err := ParseRconStatus(scanner, &status)
	if err != nil {
		t.Error("Error during parsing server response ", err)
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
}

func TestParseRconMemstats(t *testing.T) {
	var memstats ServerMemstats

	scanner := bufio.NewScanner(strings.NewReader(memstatsRcon))
	err := ParseMemstats(scanner, &memstats)

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
