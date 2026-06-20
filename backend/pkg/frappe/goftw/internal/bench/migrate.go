package bench

import (
	"fmt"
)

// Migrate runs bench Migrate
func (b *Bench) Migrate(site string) error {
	fmt.Printf("[SITES] Migrating site: %s\n", site)
	return b.ExecRunInBenchPrintIO("bench", "--site", site, "migrate")
}

// MigrateSites runs migrate for all provided sites
func (b *Bench) MigrateSites() error {
	sites, err := b.ListSites()
	if err != nil {
		fmt.Printf("[ERROR] Failed to list current sites for migration: %v\n", err)
		return err
	}

	for _, site := range sites {
		if err := b.Migrate(site); err != nil {
			fmt.Printf("[ERROR] Failed to migrate site %s: %v\n", site, err)
			return err
		}
	}
	return nil
}
