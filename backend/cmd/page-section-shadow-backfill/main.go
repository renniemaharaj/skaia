package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/page"
)

func main() {
	afterID := flag.Int64("after-id", 0, "process pages with an ID greater than this cursor")
	limit := flag.Int("limit", 100, "bounded batch size (1-500)")
	flag.Parse()

	if err := database.Init(); err != nil {
		fmt.Fprintln(os.Stderr, "initialize database:", err)
		os.Exit(1)
	}
	defer database.Close()

	result, err := page.BackfillPageSectionShadow(context.Background(), database.DB, *afterID, *limit)
	if err != nil {
		fmt.Fprintln(os.Stderr, "backfill page section shadow:", err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, "encode backfill result:", err)
		os.Exit(1)
	}
}
