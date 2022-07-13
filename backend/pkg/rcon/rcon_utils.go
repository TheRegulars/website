package rcon

import (
	"bytes"
	"crypto/hmac"
	"strconv"
	"time"

	"golang.org/x/crypto/md4"
)

const (
	QHeader            string = "\xFF\xFF\xFF\xFF"
	RconResponseHeader string = QHeader + "n"
	ChallengeRequest   string = QHeader + "getchallenge"
	ChallengeHeader    string = QHeader + "challenge "
	PingPacket         string = QHeader + "ping"
	PingResponse       string = QHeader + "ack"
)

func RconNonSecurePacket(command string, password string, buf *bytes.Buffer) {
	buf.WriteString(QHeader)
	buf.WriteString("rcon ")
	buf.WriteString(password)
	buf.WriteString(" ")
	buf.WriteString(command)
}

func RconSecureTimePacket(command string, password string, ts time.Time, buf *bytes.Buffer) {
	mac := hmac.New(md4.New, []byte(password))
	t := float64(ts.UnixNano()) / float64(time.Second/time.Nanosecond)
	timeStr := strconv.FormatFloat(t, 'f', 6, 64)
	mac.Write([]byte(timeStr))
	mac.Write([]byte(" "))
	mac.Write([]byte(command))
	buf.WriteString(QHeader)
	buf.WriteString("srcon HMAC-MD4 TIME ")
	buf.Write(mac.Sum(nil))
	buf.WriteString(" ")
	buf.WriteString(timeStr)
	buf.WriteString(" ")
	buf.WriteString(command)
}

func RconSecureChallengePacket(Command string, Password string, Challenge []byte, buf *bytes.Buffer) {
	mac := hmac.New(md4.New, []byte(Password))
	mac.Write(Challenge)
	mac.Write([]byte(" "))
	mac.Write([]byte(Command))
	buf.WriteString(QHeader)
	buf.WriteString("srcon HMAC-MD4 CHALLENGE ")
	buf.Write(mac.Sum(nil))
	buf.WriteString(" ")
	buf.Write(Challenge)
	buf.WriteString(" ")
	buf.WriteString(Command)
}
