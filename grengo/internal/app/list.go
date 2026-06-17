package app

import (
	"fmt"
	"os"
	"path/filepath"
)

func cmdList() {
	fmt.Printf("%s%-20s %-8s %-10s %-10s %s%s\n", colorBold, "CLIENT", "PORT", "STATUS", "RUNNING", "DOMAINS", colorReset)
	fmt.Printf("%-20s %-8s %-10s %-10s %s\n", "────────────────────", "────────", "──────────", "──────────", "───────────────────────")

	entries, err := os.ReadDir(backendsDir())
	if err != nil || len(entries) == 0 {
		info("No clients yet. Create one with: grengo new <name>")
		return
	}

	found := false
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		envFile := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, err := os.Stat(envFile); err != nil {
			continue
		}
		found = true

		name := envVal(envFile, "CLIENT_NAME")
		port := envVal(envFile, "PORT")
		domainsStr := envVal(envFile, "DOMAINS")

		var status, running string
		disabledFile := filepath.Join(backendsDir(), e.Name(), ".disabled")
		if _, err := os.Stat(disabledFile); err == nil {
			status = fmt.Sprintf("%sdisabled%s", colorYellow, colorReset)
		} else {
			status = fmt.Sprintf("%senabled%s", colorGreen, colorReset)
		}

		if clientRunning(name) {
			running = fmt.Sprintf("%syes%s", colorGreen, colorReset)
		} else {
			running = fmt.Sprintf("%sno%s", colorRed, colorReset)
		}

		fmt.Printf("%-20s %-8s %-22s %-22s %s\n", name, port, status, running, domainsStr)
	}

	if !found {
		info("No clients yet. Create one with: grengo new <name>")
	}
}
