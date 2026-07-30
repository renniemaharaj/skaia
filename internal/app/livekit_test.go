package app

import "testing"

func TestLiveKitURLArg(t *testing.T) {
	if got := liveKitURLArg(nil); got != "" {
		t.Fatalf("empty URL arg = %q", got)
	}
	if got := liveKitURLArg([]string{"--url", " https://live.example/ "}); got != "https://live.example" {
		t.Fatalf("URL arg = %q", got)
	}
}
