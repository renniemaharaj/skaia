package bench

import (
	"fmt"
	"goftw/internal/entity"
	"goftw/internal/utils"
	"os"
	"path/filepath"
	"sort"
)

// CheckoutSites orchestrates all site operations
func (b *Bench) CheckoutSites(instanceCfg *entity.Instance, dbRootUser, dbRootPass string) error {
	currentSites, err := b.ListSites()
	if err != nil {
		fmt.Printf("[ERROR] Failed to list current sites: %v\n", err)
		return err
	}

	if err := b.DropAbandonedSites(instanceCfg, currentSites, dbRootPass); err != nil {
		fmt.Printf("[ERROR] Failed to drop abandoned sites: %v\n", err)
		return err
	}

	for _, site := range instanceCfg.Sites {
		if err := b.CheckoutSite(site, dbRootUser, dbRootPass); err != nil {
			fmt.Printf("[ERROR] Failed to entirely checkout site %s: %v\n", site.SiteName, err)
			return err
		}
	}

	return nil
}

// CheckoutSite ensures a site exists and is properly configured.
func (b *Bench) CheckoutSite(site entity.Site, dbRootUser, dbRootPass string) error {
	if _, err := os.Stat(filepath.Join(b.Path, "sites", site.SiteName)); os.IsNotExist(err) {
		fmt.Printf("[SITES] Creating: %s\n", site.SiteName)
		if err := b.NewSite(site.SiteName, dbRootUser, dbRootPass); err != nil {
			fmt.Printf("[ERROR] Failed to create site %s: %v\n", site.SiteName, err)
			return err
		}
	}

	// Ensure apps exist locally in bench/apps
	if err := b.fetchMissingApps(site); err != nil {
		fmt.Printf("[ERROR] Failed to fetch missing apps for site %s: %v\n", site.SiteName, err)
		return err
	}

	// Get current apps (parsed and normalized)
	currentAppsInfo, err := b.ListAppsOnSite(site.SiteName)
	if err != nil {
		fmt.Printf("[ERROR] Failed to list apps for site %s: %v\n", site.SiteName, err)
		return err
	}

	currentAppNames := utils.ExtractAppNames(currentAppsInfo)
	// Expected apps (from instance.json)
	expectedApps := site.Apps

	// Normalize order
	sort.Strings(currentAppNames)
	sort.Strings(expectedApps)

	// Align apps
	if err := b.installMissingApps(site.SiteName, expectedApps, currentAppNames); err != nil {
		fmt.Printf("[ERROR] Failed to install missing apps for site %s: %v\n", site.SiteName, err)
		return err
	}
	// if err := b.uninstallExtraApps(site.SiteName, currentAppNames, expectedApps); err != nil {
	// 	fmt.Printf("[ERROR] Failed to uninstall extra apps for site %s: %v\n", site.SiteName, err)
	// 	return err
	// }

	return nil
}
