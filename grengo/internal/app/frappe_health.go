package app

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const frappeGRPCEndpoint = "127.0.0.1:3001"

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
		sites, err := listSites()
		if err != nil {
			fmt.Printf("[HEALTH] could not list sites via gRPC: %v\n", err)
			time.Sleep(interval)
			continue
		}

		for _, site := range sites {
			status := checkSite(client, site)
			logStatus(status)

			if !status.APIReachable || !status.HTTPReachable {
				ok, err := triggerDeploy()
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

func listSites() ([]string, error) {
	conn, err := grpc.NewClient(frappeGRPCEndpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	c := pb.NewGoFTWServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := c.ListSites(ctx, &pb.ListSitesRequest{})
	if err != nil {
		return nil, fmt.Errorf("rpc: %w", err)
	}

	return resp.Sites, nil
}

// SiteHealthStatus holds the result of a single health check cycle for one site.
type SiteHealthStatus struct {
	Site          string
	APIReachable  bool
	HTTPReachable bool
	Error         string
}

func checkSite(client *http.Client, site string) SiteHealthStatus {
	status := SiteHealthStatus{Site: site}

	// 1. GoFTW API probe — CheckSite over gRPC
	conn, err := grpc.NewClient(frappeGRPCEndpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		status.Error = fmt.Sprintf("API probe error (dial): %v", err)
		fmt.Printf("[HEALTH][%s] API unreachable (gRPC dial): %v\n", site, err)
	} else {
		defer conn.Close()
		c := pb.NewGoFTWServiceClient(conn)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		resp, err := c.CheckSite(ctx, &pb.CheckSiteRequest{SiteName: site})
		if err != nil {
			status.Error = fmt.Sprintf("API status: %v", err)
			fmt.Printf("[HEALTH][%s] API error via gRPC: %v\n", site, err)
		} else {
			status.APIReachable = true
			fmt.Printf("[HEALTH][%s] API OK (gRPC): %s\n", site, resp.StatusJson)
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

func triggerDeploy() (bool, error) {
	conn, err := grpc.NewClient(frappeGRPCEndpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return false, fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	c := pb.NewGoFTWServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := c.ReloadNginx(ctx, &pb.ReloadNginxRequest{})
	if err != nil {
		return false, fmt.Errorf("rpc: %w", err)
	}

	fmt.Printf("[HEALTH][DEPLOY] gRPC ReloadNginx → success: %v\n", resp.Success)

	return resp.Success, nil
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
