package app

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const frappeAPIBase = "http://127.0.0.1:3000"

// StartFrappeHealthRoutine starts the singleton background health routine.
// Call once at CLI startup. Discovers sites from the API each tick.
func StartFrappeHealthRoutine() {
	go runFrappeHealthLoop()
}

func runFrappeHealthLoop() {
	client := &http.Client{Timeout: 10 * time.Second}
	interval := 30 * time.Second

	fmt.Println("[HEALTH] Frappe health routine started")

	for {
		sites, err := listSites(client)
		if err != nil {
			fmt.Printf("[HEALTH] could not list sites: %v\n", err)
			time.Sleep(interval)
			continue
		}

		for _, site := range sites {
			status := checkSite(client, frappeAPIBase, site)
			logStatus(status)

			if !status.APIReachable || !status.HTTPReachable {
				ok, err := triggerDeploy(client, frappeAPIBase)
				if err != nil {
					fmt.Printf("[HEALTH][%s] nginx reload trigger failed: %v\n", site, err)
				} else if ok {
					fmt.Printf("[HEALTH][%s] nginx config regenerated and reloaded successfully\n", site)
				} else {
					fmt.Printf("[HEALTH][%s] deploy returned non-OK\n", site)
				}
			}
		}

		time.Sleep(interval)
	}
}

func listSites(client *http.Client) ([]string, error) {
	resp, err := client.Get(frappeAPIBase + "/api/goftw/sites")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, truncate(string(body), 120))
	}

	var sites []string
	if err := json.NewDecoder(resp.Body).Decode(&sites); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return sites, nil
}

// SiteHealthStatus holds the result of a single health check cycle for one site.
type SiteHealthStatus struct {
	Site          string
	APIReachable  bool
	HTTPReachable bool
	Error         string
}

func checkSite(client *http.Client, apiBase, site string) SiteHealthStatus {
	status := SiteHealthStatus{Site: site}

	// 1. GoFTW API probe — GET /api/goftw/site/{name}
	apiURL := fmt.Sprintf("%s/api/goftw/site/%s", apiBase, site)
	resp, err := client.Get(apiURL)
	if err != nil {
		status.Error = fmt.Sprintf("API probe error: %v", err)
		fmt.Printf("[HEALTH][%s] API unreachable: %v\n", site, err)
	} else {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == 200 {
			status.APIReachable = true
			fmt.Printf("[HEALTH][%s] API OK (200): %s\n", site, truncate(string(body), 120))
		} else {
			status.Error = fmt.Sprintf("API status %d: %s", resp.StatusCode, truncate(string(body), 120))
			fmt.Printf("[HEALTH][%s] API returned %d: %s\n", site, resp.StatusCode, truncate(string(body), 120))
		}
	}

	// 2. Direct HTTP probe on port 8000 with Host header for multi-tenant routing
	req, err := http.NewRequest("GET", "http://127.0.0.1:8000", nil)
	if err != nil {
		fmt.Printf("[HEALTH][%s] could not build direct HTTP request: %v\n", site, err)
	} else {
		req.Host = site
		httpResp, err := client.Do(req)
		if err != nil {
			fmt.Printf("[HEALTH][%s] direct HTTP probe failed: %v\n", site, err)
			if status.Error == "" {
				status.Error = fmt.Sprintf("HTTP probe error: %v", err)
			}
		} else {
			defer httpResp.Body.Close()
			io.Copy(io.Discard, httpResp.Body)
			// 200 or 302 (Frappe login redirect) both mean nginx is routing correctly
			if httpResp.StatusCode == 200 || httpResp.StatusCode == 302 {
				status.HTTPReachable = true
				fmt.Printf("[HEALTH][%s] direct HTTP OK (%d)\n", site, httpResp.StatusCode)
			} else {
				fmt.Printf("[HEALTH][%s] direct HTTP returned %d\n", site, httpResp.StatusCode)
			}
		}
	}

	return status
}

func triggerDeploy(client *http.Client, apiBase string) (bool, error) {
	deployURL := fmt.Sprintf("%s/api/goftw/deployment/nginx", apiBase)

	req, err := http.NewRequest("POST", deployURL, nil)
	if err != nil {
		return false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("POST deploy: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("[HEALTH][DEPLOY] POST /deployment/nginx → %d: %s\n", resp.StatusCode, truncate(string(body), 200))

	return resp.StatusCode >= 200 && resp.StatusCode < 300, nil
}

func logStatus(s SiteHealthStatus) {
	apiMark := "✓"
	if !s.APIReachable {
		apiMark = "✗"
	}
	httpMark := "✓"
	if !s.HTTPReachable {
		httpMark = "✗"
	}
	fmt.Printf("[HEALTH][%s] API:%s HTTP:%s\n", s.Site, apiMark, httpMark)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
