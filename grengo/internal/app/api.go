package app

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	grengoapi "github.com/skaia/grengo/internal/api"
	"github.com/skaia/grengo/internal/hardware"
	"github.com/skaia/grengo/internal/repo"
)

const (
	DefaultAPIPort = 9100
	pidFileName    = ".grengo-api.pid"
)

var apiHandlerFactory func() http.Handler

func ConfigureAPIHandler(factory func() http.Handler) {
	apiHandlerFactory = factory
}

func pidFilePath() string {
	return repo.New(ProjectRoot()).PIDFile()
}

// API lifecycle commands

// cmdAPIStart launches the internal grengo API server.
// It binds to 0.0.0.0 so Docker containers on the host can reach it,
// but it is NOT meant to be exposed to the internet (keep behind firewall).
func cmdAPIStart(port int) {
	if port <= 0 {
		port = DefaultAPIPort
	}

	// Check for an existing process.
	if pid, err := readPIDFile(); err == nil {
		if processRunning(pid) {
			die("Grengo API is already running (PID %d). Stop it first: grengo api stop", pid)
		}
		os.Remove(pidFilePath())
	}

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		die("Cannot listen on %s: %v", addr, err)
	}

	// Write PID file.
	if err := os.WriteFile(pidFilePath(), []byte(strconv.Itoa(os.Getpid())), 0644); err != nil {
		warn("Cannot write PID file: %v", err)
	}

	hardware.InitAndWatch()
	go broadcastStatsAndStorageLoop()

	if apiHandlerFactory == nil {
		die("API handler not configured")
	}
	srv := &http.Server{Handler: apiHandlerFactory()}

	// Graceful shutdown on SIGINT / SIGTERM.
	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-done
		log("Shutting down grengo API…")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	log("Grengo internal API listening on %s (PID %d)", addr, os.Getpid())
	info("Accessible from this host and local Docker containers")
	info("Stop with: grengo api stop  (or Ctrl-C)")

	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		die("Server error: %v", err)
	}
	log("Grengo API stopped")
	os.Remove(pidFilePath())
}

// cmdAPIStop sends SIGTERM to a running grengo API process.
func cmdAPIStop() {
	pid, err := readPIDFile()
	if err != nil {
		die("Grengo API is not running (no PID file)")
	}
	if !processRunning(pid) {
		os.Remove(pidFilePath())
		die("Grengo API is not running (stale PID file)")
	}

	p, err := os.FindProcess(pid)
	if err != nil {
		die("Cannot find process %d: %v", pid, err)
	}
	if err := p.Signal(syscall.SIGTERM); err != nil {
		die("Cannot send signal to PID %d: %v", pid, err)
	}
	log("Sent stop signal to grengo API (PID %d)", pid)

	// Wait briefly for the process to exit.
	for i := 0; i < 20; i++ {
		time.Sleep(250 * time.Millisecond)
		if !processRunning(pid) {
			log("Grengo API stopped")
			os.Remove(pidFilePath())
			return
		}
	}
	warn("Process %d did not exit in 5s — may still be shutting down", pid)
}

func cmdAPIStatus() {
	pid, err := readPIDFile()
	if err != nil {
		info("Grengo API is not running")
		return
	}
	if processRunning(pid) {
		info("Grengo API is running (PID %d)", pid)
	} else {
		info("Grengo API is not running (stale PID file)")
		os.Remove(pidFilePath())
	}
}

// Helpers

func readPIDFile() (int, error) {
	data, err := os.ReadFile(pidFilePath())
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

func processRunning(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}

func apiJSON(w http.ResponseWriter, status int, v any) {
	grengoapi.WriteJSON(w, status, v)
}

func apiError(w http.ResponseWriter, status int, msg string) {
	grengoapi.WriteError(w, status, msg)
}

type APIHandlers struct {
	ListSites      http.HandlerFunc
	Stats          http.HandlerFunc
	Storage        http.HandlerFunc
	SysInfo        http.HandlerFunc
	GetEnv         http.HandlerFunc
	PutEnv         http.HandlerFunc
	Exec           http.HandlerFunc
	FrappeProvision http.HandlerFunc
	ExportSite     http.HandlerFunc
	ImportSite     http.HandlerFunc
	ArmSite        http.HandlerFunc
	DisarmSite     http.HandlerFunc
	MigrateSite    http.HandlerFunc
	MigrateAll     http.HandlerFunc
	ExportNode     http.HandlerFunc
	ImportNode     http.HandlerFunc
	ListJobs       http.HandlerFunc
	GetJob         http.HandlerFunc
	DownloadJob    http.HandlerFunc
	ListExports    http.HandlerFunc
	DownloadExport http.HandlerFunc
	DeleteExport   http.HandlerFunc
	WebSocket      http.HandlerFunc
	VerifyPasscode http.HandlerFunc
	PasscodeStatus http.HandlerFunc
	WebhookGithub  http.HandlerFunc
}

func Handlers() APIHandlers {
	return APIHandlers{
		ListSites:      apiListSites,
		Stats:          apiStats,
		Storage:        apiStorage,
		SysInfo:        apiSysInfo,
		GetEnv:         apiGetEnv,
		PutEnv:         apiPutEnv,
		Exec:           apiExec,
		FrappeProvision: apiFrappeProvision,
		ExportSite:     apiExportSite,
		ImportSite:     apiImportSite,
		ArmSite:        apiArmSite,
		DisarmSite:     apiDisarmSite,
		MigrateSite:    apiMigrateSite,
		MigrateAll:     apiMigrateAll,
		ExportNode:     apiExportNode,
		ImportNode:     apiImportNode,
		ListJobs:       apiListJobs,
		GetJob:         apiGetJob,
		DownloadJob:    apiDownloadJob,
		ListExports:    apiListExports,
		DownloadExport: apiDownloadExport,
		DeleteExport:   apiDeleteExport,
		WebSocket:      apiWebSocket,
		VerifyPasscode: apiVerifyPasscode,
		PasscodeStatus: apiPasscodeStatus,
		WebhookGithub:  apiWebhookGithub,
	}
}

func PasscodeConfigured() bool {
	return passcodeConfigured()
}

func VerifyPasscode(p1, p2 string) bool {
	return verifyPasscode(p1, p2)
}
