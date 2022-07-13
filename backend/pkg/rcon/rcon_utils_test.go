package rcon

import (
	"bytes"
	"testing"
	"time"
)

const rconChallengePacket = "\xFF\xFF\xFF\xFFsrcon HMAC-MD4 CHALLENGE " +
	"D\x89\xfd\x15\xccZ\xea\xeb\x0e\xbfl\xd6C\x05T\x12 11111111111 status"

const rconTimePacket = "\xff\xff\xff\xffsrcon HMAC-MD4 TIME R\xcbv\xf0\xa7p\xcd\xca\xf2!\xc3~\x06\xa9\x9f\xa8 100.000000 status"

func TestRconNonSecure(t *testing.T) {
	var b bytes.Buffer
	RconNonSecurePacket("status", "passw", &b)
	if b.String() != "\xFF\xFF\xFF\xFFrcon passw status" {
		t.Error("Incorrect result: ", b.String())
	}
}

func TestRconSecureChallenge(t *testing.T) {
	var b bytes.Buffer
	RconSecureChallengePacket("status", "passw", []byte("11111111111"), &b)
	if b.String() != rconChallengePacket {
		t.Error("Incorrect result: ", b.String())
	}
}

func TestRconSecureTime(t *testing.T) {
	var b bytes.Buffer
	RconSecureTimePacket("status", "passw", time.Unix(100, 0), &b)
	if b.String() != rconTimePacket {
		t.Error("Incorrect result: ", b.String())
	}
}
