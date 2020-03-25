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
}
