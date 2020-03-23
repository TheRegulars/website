package main

import "fmt"
import "bytes"

func main() {
	buf := bytes.NewBuffer(make([]byte, 0, 1400))
	RconNonSecurePacket("test", "best", buf)
	fmt.Println(buf.String())
}
