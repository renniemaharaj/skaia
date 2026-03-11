package integration

import (
	"bytes"
	"database/sql"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
)

// RegisterUploadTests registers all file-upload integration tests onto s.
// A real user is created to supply a valid JWT; no filesystem side-effects are
// left behind because the uploads directory is ephemeral in the test container.
func RegisterUploadTests(s *Suite, db *sql.DB) {
	var userToken string

	// ── setup: create an authenticated user ───────────────────────────────────
	s.Add("upload/setup", func(t *T) {
		email := uniq("uploader") + "@skaia.test"
		username := uniq("uploader")
		resp := s.POST("/auth/register", map[string]any{
			"username": username,
			"email":    email,
			"password": "UploaderPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		userToken = Str(ReadJSON(resp)["access_token"])
		t.Require(userToken != "", "uploader token must be non-empty")
	})

	// ── upload/image_requires_auth ────────────────────────────────────────────
	s.Add("upload/image_requires_auth", func(t *T) {
		body, ct := buildMultipartImage(t, "test.png", makePNG(1, 1))
		resp := doMultipart(s, "POST", "/upload/image", body, ct, nil)
		t.Require(resp.StatusCode == 401,
			"image upload without auth must return 401, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/video_requires_auth ────────────────────────────────────────────
	s.Add("upload/video_requires_auth", func(t *T) {
		body, ct := buildMultipartRaw(t, "file", "clip.mp4", []byte("fake video"))
		resp := doMultipart(s, "POST", "/upload/video", body, ct, nil)
		t.Require(resp.StatusCode == 401,
			"video upload without auth must return 401, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/file_requires_auth ─────────────────────────────────────────────
	s.Add("upload/file_requires_auth", func(t *T) {
		body, ct := buildMultipartRaw(t, "file", "doc.pdf", []byte("fake doc"))
		resp := doMultipart(s, "POST", "/upload/file", body, ct, nil)
		t.Require(resp.StatusCode == 401,
			"file upload without auth must return 401, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/banner_requires_auth ───────────────────────────────────────────
	s.Add("upload/banner_requires_auth", func(t *T) {
		body, ct := buildMultipartImage(t, "banner.png", makePNG(800, 350))
		// Use "banner" field name as the handler expects.
		body, ct = buildMultipartRaw(t, "banner", "banner.png", encodePNG(makePNG(800, 350)))
		resp := doMultipart(s, "POST", "/upload/banner", body, ct, nil)
		t.Require(resp.StatusCode == 401,
			"banner upload without auth must return 401, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/image_missing_file_field ──────────────────────────────────────
	s.Add("upload/image_missing_file_field", func(t *T) {
		// Send an empty multipart form — the "file" field is absent.
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		w.Close()
		resp := doMultipart(s, "POST", "/upload/image", &buf, w.FormDataContentType(), Bearer(userToken))
		t.Require(resp.StatusCode == 400,
			"image upload with missing field must return 400, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/image_wrong_content_type ──────────────────────────────────────
	s.Add("upload/image_wrong_content_type", func(t *T) {
		// Send a plaintext file disguised with a .png extension.
		body, ct := buildMultipartRaw(t, "file", "notanimage.png", []byte("this is plain text, not an image"))
		resp := doMultipart(s, "POST", "/upload/image", body, ct, Bearer(userToken))
		t.Require(resp.StatusCode == 400,
			"image upload with wrong content type must return 400, got %d", resp.StatusCode)
		data := ReadJSON(resp)
		t.Require(Str(data["error"]) != "", "error message must be present")
	})

	// ── upload/image_success ──────────────────────────────────────────────────
	s.Add("upload/image_success", func(t *T) {
		pngData := encodePNG(makePNG(100, 100))
		body, ct := buildMultipartRaw(t, "file", "photo.png", pngData)
		resp := doMultipart(s, "POST", "/upload/image", body, ct, Bearer(userToken))
		t.Require(resp.StatusCode == 201,
			"valid image upload must return 201, got %d", resp.StatusCode)
		data := ReadJSON(resp)
		t.Require(Str(data["url"]) != "", "url must be present in upload response")
		t.Require(ID(data["size"]) > 0, "size must be non-zero")
		t.Require(strings.HasPrefix(Str(data["url"]), "/uploads/"),
			"url must be under /uploads/, got %s", Str(data["url"]))
	})

	// ── upload/file_success ───────────────────────────────────────────────────
	s.Add("upload/file_success", func(t *T) {
		content := []byte("Hello integration test attachment")
		body, ct := buildMultipartRaw(t, "file", "readme.txt", content)
		resp := doMultipart(s, "POST", "/upload/file", body, ct, Bearer(userToken))
		t.Require(resp.StatusCode == 201,
			"valid file upload must return 201, got %d", resp.StatusCode)
		data := ReadJSON(resp)
		t.Require(Str(data["url"]) != "", "url must be present")
		t.Require(ID(data["size"]) == int64(len(content)), "size must match content length")
	})

	// ── upload/serve_traversal_blocked ────────────────────────────────────────
	s.Add("upload/serve_traversal_blocked", func(t *T) {
		resp := s.GET("/uploads/../etc/passwd", nil)
		// Go's http.FileServer cleans the path (/../etc/passwd → /etc/passwd) and
		// returns 404 when the file doesn't exist, which is equally safe as 403.
		t.Require(resp.StatusCode == 403 || resp.StatusCode == 400 || resp.StatusCode == 404,
			"directory traversal must be blocked (4xx), got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/serve_nonexistent ──────────────────────────────────────────────
	s.Add("upload/serve_nonexistent", func(t *T) {
		resp := s.GET("/uploads/users/0/nonexistent_file_xyz.png", nil)
		t.Require(resp.StatusCode == 404,
			"missing upload file must return 404, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/serve_nonexistent_webp ──────────────────────────────────────────
	s.Add("upload/serve_nonexistent_webp", func(t *T) {
		resp := s.GET("/uploads/users/0/nonexistent_file_xyz.webp", nil)
		t.Require(resp.StatusCode == 404,
			"missing webp upload file must return 404, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── upload/image_served_after_upload ─────────────────────────────────────
	s.Add("upload/image_served_after_upload", func(t *T) {
		// Upload a fresh image, then verify it is accessible via the static URL.
		pngData := encodePNG(makePNG(50, 50))
		body, ct := buildMultipartRaw(t, "file", "served.png", pngData)
		uploadResp := doMultipart(s, "POST", "/upload/image", body, ct, Bearer(userToken))
		t.RequireStatus(uploadResp, 201)
		data := ReadJSON(uploadResp)
		url := Str(data["url"])
		t.Require(url != "", "upload must return a url")

		serveResp := s.GET(url, nil)
		t.Require(serveResp.StatusCode == 200,
			"uploaded file must be served at its reported URL, got %d", serveResp.StatusCode)
		serveResp.Body.Close()

		// legacy path should also work
		if strings.HasPrefix(url, "/uploads/") {
			legacy := "/api" + url
			legacyResp := s.GET(legacy, nil)
			t.Require(legacyResp.StatusCode == 200,
				"legacy URL must still serve upload, got %d", legacyResp.StatusCode)
			legacyResp.Body.Close()
		}
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

// makePNG creates an in-memory RGBA image of width×height.
func makePNG(width, height int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 100, G: 149, B: 237, A: 255})
		}
	}
	return img
}

// encodePNG encodes img to a PNG byte slice.
func encodePNG(img *image.RGBA) []byte {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		panic(fmt.Sprintf("encodePNG: %v", err))
	}
	return buf.Bytes()
}

// buildMultipartImage builds a multipart body with field name "file" and the
// given PNG image data, setting Content-Type to "image/png" explicitly.
func buildMultipartImage(t *T, filename string, img *image.RGBA) (*bytes.Buffer, string) {
	return buildMultipartRaw(t, "file", filename, encodePNG(img))
}

// buildMultipartRaw creates a multipart form body with the given field, filename
// and raw byte content. The Content-Type header returned must be used on the request.
func buildMultipartRaw(t *T, field, filename string, data []byte) (*bytes.Buffer, string) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	// Create a part with explicit Content-Type so sniffing gets the right type.
	partHeader := textproto.MIMEHeader{}
	partHeader.Set("Content-Disposition",
		fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, filename))

	// Derive MIME type from extension for helpful server-side sniffing.
	ct := "application/octet-stream"
	if strings.HasSuffix(filename, ".png") {
		ct = "image/png"
	} else if strings.HasSuffix(filename, ".jpg") || strings.HasSuffix(filename, ".jpeg") {
		ct = "image/jpeg"
	} else if strings.HasSuffix(filename, ".mp4") {
		ct = "video/mp4"
	} else if strings.HasSuffix(filename, ".webm") {
		ct = "video/webm"
	}
	partHeader.Set("Content-Type", ct)

	part, err := w.CreatePart(partHeader)
	if err != nil {
		t.Fatalf("buildMultipartRaw: CreatePart: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("buildMultipartRaw: Write: %v", err)
	}
	w.Close()
	return &buf, w.FormDataContentType()
}

// doMultipart sends a multipart/form-data request through the test suite's
// HTTP client. headers may be nil.
func doMultipart(s *Suite, method, path string, body *bytes.Buffer, contentType string, headers map[string]string) *http.Response {
	req, err := http.NewRequest(method, s.URL(path), body)
	if err != nil {
		panic(fmt.Sprintf("doMultipart: NewRequest: %v", err))
	}
	req.Header.Set("Content-Type", contentType)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		panic(fmt.Sprintf("doMultipart: Do: %v", err))
	}
	return resp
}
