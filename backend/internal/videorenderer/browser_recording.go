package videorenderer

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

type BrowserRecordingOptions struct {
	Width  int
	Height int
	FPS    int
}

func FinalizeBrowserRecording(recording io.Reader, options BrowserRecordingOptions) (string, func(), error) {
	timeout := 5 * time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	workDir, err := os.MkdirTemp("", "skaia-browser-export-*")
	if err != nil {
		return "", nil, fmt.Errorf("failed to create browser export workspace: %w", err)
	}

	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}

	inputPath := filepath.Join(workDir, "recording.webm")
	input, err := os.Create(inputPath)
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("failed to create browser recording file: %w", err)
	}
	if _, err := io.Copy(input, recording); err != nil {
		_ = input.Close()
		cleanup()
		return "", nil, fmt.Errorf("failed to write browser recording: %w", err)
	}
	if err := input.Close(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("failed to close browser recording: %w", err)
	}

	outFile := filepath.Join(workDir, fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano()))
	args := browserRecordingFFmpegArgs(inputPath, outFile, options)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	cmd.Dir = workDir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			killProcessGroup(cmd.Process)
			cleanup()
			return "", nil, fmt.Errorf(
				"browser export finalization timed out after %s\nstdout:\n%s\nstderr:\n%s",
				timeout,
				stdout.String(),
				stderr.String(),
			)
		}

		cleanup()
		return "", nil, fmt.Errorf(
			"browser export finalization failed: %w\nstdout:\n%s\nstderr:\n%s",
			err,
			stdout.String(),
			stderr.String(),
		)
	}

	if _, err := os.Stat(outFile); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("browser export output missing: %s: %w", outFile, err)
	}

	return outFile, cleanup, nil
}

func killProcessGroup(p *os.Process) {
	if p == nil {
		return
	}
	_ = syscall.Kill(-p.Pid, syscall.SIGKILL)
}

func browserRecordingFFmpegArgs(inputPath, outFile string, options BrowserRecordingOptions) []string {
	width := options.Width
	if width <= 0 {
		width = 1920
	}
	height := options.Height
	if height <= 0 {
		height = 1080
	}
	fps := options.FPS
	if fps <= 0 {
		fps = 30
	}

	return []string{
		"-y",
		"-i", inputPath,
		"-r", strconv.Itoa(fps),
		"-vf", fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1", width, height, width, height),
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-b:a", "192k",
		"-movflags", "+faststart",
		"-shortest",
		outFile,
	}
}
