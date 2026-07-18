package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/page"
)

type output struct {
	Audit     *page.PageSectionCutoverResult `json:"audit,omitempty"`
	Preflight page.LegacyRetirementPreflight `json:"legacy_write_retirement_preflight"`
}

func main() {
	afterID := flag.Int64("after-id", 0, "audit pages with an ID greater than this cursor")
	limit := flag.Int("limit", 100, "bounded audit batch size (1-500)")
	minimumRuns := flag.Int("minimum-matched-runs", page.DefaultCutoverMatchedRuns, "consecutive matched observations required")
	minimumWindow := flag.Duration("minimum-match-window", page.DefaultCutoverMatchWindow, "sustained zero-diff window")
	releaseWindow := flag.Duration("legacy-release-window", page.DefaultLegacyReleaseWindow, "quiet compatibility-write window required for retirement")
	preflightOnly := flag.Bool("preflight-only", false, "skip the parity and rollback audit")
	externalReviewed := flag.Bool("confirm-no-external-dependencies", false, "operator attestation that scheduled jobs and external clients no longer write pages.content")
	flag.Parse()

	if *minimumRuns < 1 || *minimumWindow <= 0 || *releaseWindow <= 0 {
		fmt.Fprintln(os.Stderr, "cutover thresholds must be positive")
		os.Exit(2)
	}
	if err := database.Init(); err != nil {
		fmt.Fprintln(os.Stderr, "initialize database:", err)
		os.Exit(1)
	}
	defer database.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	result := output{}
	if !*preflightOnly {
		audit, err := page.AuditPageSectionCutover(ctx, database.DB, *afterID, *limit, *minimumRuns, *minimumWindow)
		if err != nil {
			fmt.Fprintln(os.Stderr, "audit page section cutover:", err)
			os.Exit(1)
		}
		result.Audit = &audit
	}
	preflight, err := page.CheckLegacyPageWriteRetirement(ctx, database.DB, *minimumRuns, *minimumWindow, *releaseWindow, *externalReviewed)
	if err != nil {
		fmt.Fprintln(os.Stderr, "check legacy write retirement:", err)
		os.Exit(1)
	}
	result.Preflight = preflight
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, "encode cutover result:", err)
		os.Exit(1)
	}
}
