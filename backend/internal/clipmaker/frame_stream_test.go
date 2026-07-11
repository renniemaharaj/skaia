package clipmaker

import (
	"bufio"
	"strings"
	"testing"
)

func TestReadFrameStreamMetaValidatesAudioAndDuration(t *testing.T) {
	tests := []struct {
		name string
		json string
	}{
		{"too many audio tracks", `{"type":"meta","fps":30,"width":1280,"height":720,"duration_seconds":2,"total_frames":60,"audio_tracks":33}`},
		{"zero duration", `{"type":"meta","fps":30,"width":1280,"height":720,"duration_seconds":0,"total_frames":60,"audio_tracks":0}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := readFrameStreamMeta(bufio.NewReader(strings.NewReader(test.json + "\n"))); err == nil {
				t.Fatal("expected invalid metadata to be rejected")
			}
		})
	}
}

func TestValidateAudioHeader(t *testing.T) {
	valid := audioStreamHeader{
		Type: "audio", Index: 0, StartSeconds: 1, EndSeconds: 3, TrimSeconds: 0.5,
		PlaybackRate: 1, Volume: 0.8, ByteLength: 1024,
	}
	if err := validateAudioHeader(valid, 0, 5); err != nil {
		t.Fatalf("valid audio header rejected: %v", err)
	}

	invalid := valid
	invalid.EndSeconds = 6
	if err := validateAudioHeader(invalid, 0, 5); err == nil {
		t.Fatal("audio extending beyond export duration was accepted")
	}
}
