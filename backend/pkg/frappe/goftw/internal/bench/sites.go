package bench

import (
	"fmt"
	"goftw/internal/entity"
)

// siteExistsInCfx checks if a site exists in the instance configuration
func siteExistsInCfx(site string, cfg *entity.Instance) bool {
	for _, s := range cfg.Sites {
		if s.SiteName == site {
			return true
		}
	}
	return false
}

// New creates a new site
func (b *Bench) NewSite(site, dbRootUser, dbRootPass string) error {
	err := b.ExecRunInBenchPrintIO("bench", "new-site", site, "--db-root-username", dbRootUser, "--db-root-password", dbRootPass, "--admin-password", "admin")
	return err
}

func (b *Bench) DropSite(site, dbRootUser, dbRootPass string) error {
	err := b.ExecRunInBenchPrintIO("bench", "drop-site", site, "--force", "--root-password", dbRootPass)
	return err
}

// DropAbandonedSites drops sites that exist in the bench but are not listed in instance.json
func (b *Bench) DropAbandonedSites(cfg *entity.Instance, currentSites []string, dbRootPass string) error {
	if !cfg.DropAbandonedSites {
		fmt.Println("[SITES] Skipping drop of abandoned sites")
		return nil
	}

	for _, site := range currentSites {
		if !siteExistsInCfx(site, cfg) {
			fmt.Printf("[SITES] Dropping unlisted site: %s\n", site)
			if err := b.ExecRunInBenchPrintIO("bench", "drop-site", site, "--force", "--root-password", dbRootPass); err != nil {
				fmt.Printf("[ERROR] Failed to drop site %s: %v\n", site, err)
			}
		}
	}
	return nil
}
