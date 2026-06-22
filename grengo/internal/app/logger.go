package app

import (
	"strings"
	"sync"
	"time"
)

type LogLine struct {
	Level  string `json:"level"`
	Prefix string `json:"prefix"`
	Msg    string `json:"msg"`
	Time   string `json:"time"`
}

var (
	logStreamMu sync.Mutex
	logStreams  = make(map[chan LogLine]bool)
)

func BroadcastLog(level, prefix, msg string) {
	line := LogLine{
		Level:  level,
		Prefix: prefix,
		Msg:    msg,
		Time:   time.Now().Format("2006-01-02 15:04:05.000"),
	}
	logStreamMu.Lock()
	defer logStreamMu.Unlock()
	for ch := range logStreams {
		select {
		case ch <- line:
		default:
		}
	}
}

type logWriter struct {
	prefix string
	level  string
}

func (lw *logWriter) Write(p []byte) (n int, err error) {
	lines := strings.Split(string(p), "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			BroadcastLog(lw.level, lw.prefix, line)
		}
	}
	return len(p), nil
}

func NewLogWriter(prefix, level string) *logWriter {
	return &logWriter{prefix: prefix, level: level}
}
