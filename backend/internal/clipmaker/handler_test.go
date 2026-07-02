package clipmaker

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareProjectForRenderRewritesUploadURLs(t *testing.T) {
	t.Setenv("SKAIA_RENDER_BASE_URL", "http://127.0.0.1:9999")

	project := json.RawMessage(`{
		"items": [
			{ "url": "/uploads/users/1/videos/source.mp4" },
			{ "nested": { "src": "/uploads/users/1/images/poster.png" } },
			{ "url": "https://example.com/video.mp4" }
		]
	}`)

	rewrittenProject, rewrittenCount, err := prepareProjectForRender(project)
	if err != nil {
		t.Fatalf("prepareProjectForRender returned error: %v", err)
	}
	if rewrittenCount != 2 {
		t.Fatalf("expected 2 rewritten URLs, got %d", rewrittenCount)
	}

	var got struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(rewrittenProject, &got); err != nil {
		t.Fatalf("unmarshal rewritten project: %v", err)
	}

	if got.Items[0]["url"] != "http://127.0.0.1:9999/uploads/users/1/videos/source.mp4" {
		t.Fatalf("first upload URL was not rewritten: %#v", got.Items[0]["url"])
	}

	nested := got.Items[1]["nested"].(map[string]any)
	if nested["src"] != "http://127.0.0.1:9999/uploads/users/1/images/poster.png" {
		t.Fatalf("nested upload URL was not rewritten: %#v", nested["src"])
	}

	if got.Items[2]["url"] != "https://example.com/video.mp4" {
		t.Fatalf("external URL should not be rewritten: %#v", got.Items[2]["url"])
	}
}

func TestRenderBaseURLDefaultsToLoopbackPort(t *testing.T) {
	t.Setenv("SKAIA_RENDER_BASE_URL", "")
	t.Setenv("PORT", "4567")

	if got := renderBaseURL(); got != "http://127.0.0.1:4567" {
		t.Fatalf("expected loopback render base URL, got %q", got)
	}
}

func TestRenderBaseURLFallsBackToDefaultPort(t *testing.T) {
	t.Setenv("SKAIA_RENDER_BASE_URL", "")
	if err := os.Unsetenv("PORT"); err != nil {
		t.Fatalf("unset PORT: %v", err)
	}

	if got := renderBaseURL(); got != "http://127.0.0.1:8080" {
		t.Fatalf("expected default render base URL, got %q", got)
	}
}

func TestDirectUploadVideoSourceAcceptsSingleUneditedUserMP4(t *testing.T) {
	userID := int64(42)
	sourcePath := filepath.Join("uploads", "users", "42", "videos", "source.mp4")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll("uploads")
	})
	if err := os.WriteFile(sourcePath, []byte("fake mp4"), 0644); err != nil {
		t.Fatalf("write source video: %v", err)
	}

	project := json.RawMessage(`{
		"assets": {
			"source": {
				"type": "video",
				"url": "/uploads/users/42/videos/source.mp4",
				"duration": 10000
			}
		},
		"properties": { "width": 1920, "height": 1080, "fps": 30 },
		"tracks": [
			{
				"id": "video-track",
				"type": "video",
				"elements": [
					{
						"id": "source",
						"type": "video",
						"s": 0,
						"e": 10,
						"props": {
							"src": "/uploads/users/42/videos/source.mp4",
							"time": 0,
							"playbackRate": 1
						}
					}
				]
			}
		]
	}`)

	got, ok, err := directUploadVideoSource(project, userID)
	if err != nil {
		t.Fatalf("directUploadVideoSource returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected direct upload source to be accepted")
	}

	absSource, err := filepath.Abs(sourcePath)
	if err != nil {
		t.Fatalf("abs source: %v", err)
	}
	if got != absSource {
		t.Fatalf("expected source path %q, got %q", absSource, got)
	}
}

func TestDirectUploadVideoSourceRejectsEditedTimeline(t *testing.T) {
	project := json.RawMessage(`{
		"tracks": [
			{
				"id": "video-track",
				"type": "video",
				"elements": [
					{
						"id": "source",
						"type": "video",
						"s": 0,
						"e": 10,
						"animation": { "name": "fade" },
						"props": { "src": "/uploads/users/42/videos/source.mp4" }
					}
				]
			}
		]
	}`)

	if _, ok, err := directUploadVideoSource(project, 42); err != nil || ok {
		t.Fatalf("expected edited timeline to be rejected, ok=%v err=%v", ok, err)
	}
}
