package main

import (
	"bufio"
	"bytes"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	pInitialState = 0
	pSeenNewLine  = 1
	pKeyInput     = 2
	pValueInput   = 3
)

type DBCallback = func(key, value string, state interface{})

type RecordItem struct {
	Name  string  `json:"name"`
	Value float64 `json:"val"`
}

type Records = map[string]*RecordItem

func updateRecords(key, value string, istate interface{}) {
	state, ok := istate.(Records)
	if !ok {
		return
	}
	if strings.HasSuffix(key, captimeNetnameSuf) {
		mapname := strings.TrimSuffix(key, captimeNetnameSuf)
		item, ok := state[mapname]
		if ok {
			item.Name = value
		} else {
			state[mapname] = &RecordItem{value, 0.0}
		}
	} else if strings.HasSuffix(key, captimeSuf) {
		mapname := strings.TrimSuffix(key, captimeSuf)
		record, err := strconv.ParseFloat(value, 64)
		if err != nil {
			log.Printf("Can't parse float in gamedb: %v", err)
			return
		}
		item, ok := state[mapname]
		if ok {
			item.Value = record
		} else {
			state[mapname] = &RecordItem{"", record}
		}
	}
}

func mergeRecords(main, temp Records) {
	for k, v := range temp {
		item, ok := main[k]
		if !ok {
			main[k] = v
		} else if v.Value < item.Value {
			// record is better
			main[k] = v
		}
	}
}

func ReadXonoticDB(filePath string, callback DBCallback, state interface{}) error {
	var keyBuf, valueBuf bytes.Buffer

	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	reader := bufio.NewReader(file)
	parserState := pInitialState
	consumeItem := func() {

		if parserState != pValueInput {
			// we are called from invalid state, ignore
			return
		}

		valueStr, err := url.QueryUnescape(valueBuf.String())
		if err != nil {
			log.Printf("Uneable to parse gamedb value: %v", err)
			return
		}
		callback(keyBuf.String(), valueStr, state)
		keyBuf.Reset()
		valueBuf.Reset()
	}
	for {
		b, err := reader.ReadByte()
		if err != nil {
			// reached end of file
			break
		}
		switch b {
		case '\n':
			consumeItem()
			parserState = pSeenNewLine
		case '\\':
			if parserState == pSeenNewLine {
				parserState = pKeyInput
			} else if parserState == pKeyInput {
				parserState = pValueInput
			} else if parserState == pValueInput {
				consumeItem()
				parserState = pKeyInput
			}
		default:
			if parserState == pKeyInput {
				keyBuf.WriteByte(b)
			} else if parserState == pValueInput {
				valueBuf.WriteByte(b)
			}
		}
	}
	return nil
}

func ReadCaptimeRecords(fileList []string) (Records, error) {
	records := make(Records)

	for _, filePath := range fileList {
		tempRecords := make(Records)
		err := ReadXonoticDB(filePath, updateRecords, tempRecords)
		if err != nil {
			return nil, err
		}
		mergeRecords(records, tempRecords)
	}

	return records, nil
}
