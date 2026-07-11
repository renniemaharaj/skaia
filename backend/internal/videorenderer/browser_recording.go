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
	"strings"
	"syscall"
	"time"
)

type BrowserRecordingOptions struct {
	Width  int
	Height int
	FPS    int
}

type FrameRenderOptions struct {
	Width       int
	Height      int
	FPS         int
	TotalFrames int
	AudioTracks []AudioTrack
}

type AudioTrack struct {
	Path         string
	StartSeconds float64
	EndSeconds   float64
	TrimSeconds  float64
	PlaybackRate float64
	Volume       float64
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

func FinalizePNGFrames(frameWorkDir string, options FrameRenderOptions) (string, func(), error) {
	timeout := 5 * time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	outputDir, err := os.MkdirTemp("", "skaia-frame-render-*")
	if err != nil {
		return "", nil, fmt.Errorf("failed to create frame render workspace: %w", err)
	}
	cleanup := func() {
		_ = os.RemoveAll(outputDir)
	}

	outFile := filepath.Join(outputDir, fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano()))
	args := pngFrameFFmpegArgs(filepath.Join(frameWorkDir, "frames", "frame-%06d.png"), outFile, options)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	cmd.Dir = frameWorkDir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			killProcessGroup(cmd.Process)
			cleanup()
			return "", nil, fmt.Errorf(
				"frame export finalization timed out after %s\nstdout:\n%s\nstderr:\n%s",
				timeout,
				stdout.String(),
				stderr.String(),
			)
		}

		cleanup()
		return "", nil, fmt.Errorf(
			"frame export finalization failed: %w\nstdout:\n%s\nstderr:\n%s",
			err,
			stdout.String(),
			stderr.String(),
		)
	}

	if _, err := os.Stat(outFile); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("frame export output missing: %s: %w", outFile, err)
	}

	return outFile, cleanup, nil
}

func pngFrameFFmpegArgs(inputPattern, outFile string, options FrameRenderOptions) []string {
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

	args := []string{
		"-y",
		"-framerate", strconv.Itoa(fps),
		"-i", inputPattern,
	}
	for _, track := range options.AudioTracks {
		args = append(args, "-i", track.Path)
	}

	args = append(args,
		"-frames:v", strconv.Itoa(options.TotalFrames),
		"-r", strconv.Itoa(fps),
		"-vf", fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1", width, height, width, height),
	)
	if len(options.AudioTracks) > 0 {
		filters := make([]string, 0, len(options.AudioTracks)+1)
		mixInputs := ""
		for index, track := range options.AudioTracks {
			duration := track.EndSeconds - track.StartSeconds
			trimStart := track.TrimSeconds * track.PlaybackRate
			trimDuration := duration * track.PlaybackRate
			label := fmt.Sprintf("a%d", index)
			filters = append(filters, fmt.Sprintf(
				"[%d:a]atrim=start=%s:duration=%s,asetpts=PTS-STARTPTS,%svolume=%s,adelay=%d:all=1[%s]",
				index+1, ffmpegFloat(trimStart), ffmpegFloat(trimDuration), atempoFilters(track.PlaybackRate),
				ffmpegFloat(track.Volume), int64(track.StartSeconds*1000), label,
			))
			mixInputs += "[" + label + "]"
		}
		filters = append(filters, fmt.Sprintf("%samix=inputs=%d:duration=longest:normalize=0[aout]", mixInputs, len(options.AudioTracks)))
		args = append(args, "-filter_complex", strings.Join(filters, ";"), "-map", "0:v:0", "-map", "[aout]")
	}
	args = append(args,
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-pix_fmt", "yuv420p",
	)
	if len(options.AudioTracks) > 0 {
		args = append(args, "-c:a", "aac", "-b:a", "192k")
	}
	args = append(args,
		"-movflags", "+faststart",
		"-t", ffmpegFloat(float64(options.TotalFrames)/float64(fps)),
		outFile,
	)
	return args
}

func ffmpegFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 6, 64)
}

func atempoFilters(rate float64) string {
	filters := ""
	for rate > 2 {
		filters += "atempo=2,"
		rate /= 2
	}
	for rate < 0.5 {
		filters += "atempo=0.5,"
		rate /= 0.5
	}
	return filters + "atempo=" + ffmpegFloat(rate) + ","
}
