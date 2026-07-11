package videorenderer

import (
	"strings"
	"testing"
)

func TestPNGFrameFFmpegArgsWithoutAudio(t *testing.T) {
	args := pngFrameFFmpegArgs("frames/frame-%06d.png", "clip.mp4", FrameRenderOptions{
		Width: 1280, Height: 720, FPS: 30, TotalFrames: 60,
	})
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "-filter_complex") || strings.Contains(joined, "-c:a") {
		t.Fatalf("video-only export unexpectedly configured audio: %s", joined)
	}
	if !strings.Contains(joined, "-t 2.000000") {
		t.Fatalf("export duration missing from ffmpeg args: %s", joined)
	}
}

func TestPNGFrameFFmpegArgsMixesTimedAudio(t *testing.T) {
	args := pngFrameFFmpegArgs("frames/frame-%06d.png", "clip.mp4", FrameRenderOptions{
		Width: 1920, Height: 1080, FPS: 24, TotalFrames: 120,
		AudioTracks: []AudioTrack{
			{Path: "music.mp3", StartSeconds: 1.5, EndSeconds: 4.5, TrimSeconds: 2, PlaybackRate: 1.5, Volume: 0.7},
			{Path: "voice.wav", StartSeconds: 0, EndSeconds: 5, PlaybackRate: 1, Volume: 1},
		},
	})
	joined := strings.Join(args, " ")
	checks := []string{
		"-i music.mp3 -i voice.wav",
		"[1:a]atrim=start=3.000000:duration=4.500000",
		"atempo=1.500000,volume=0.700000,adelay=1500:all=1[a0]",
		"[a0][a1]amix=inputs=2:duration=longest:normalize=0[aout]",
		"-map 0:v:0 -map [aout]",
		"-c:a aac -b:a 192k",
		"-t 5.000000",
	}
	for _, check := range checks {
		if !strings.Contains(joined, check) {
			t.Errorf("ffmpeg args missing %q: %s", check, joined)
		}
	}
}

func TestAtempoFiltersSupportsExtendedRates(t *testing.T) {
	if got := atempoFilters(4); got != "atempo=2,atempo=2.000000," {
		t.Fatalf("atempoFilters(4) = %q", got)
	}
	if got := atempoFilters(0.25); got != "atempo=0.5,atempo=0.500000," {
		t.Fatalf("atempoFilters(0.25) = %q", got)
	}
}
