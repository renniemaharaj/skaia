package grengo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	pb "github.com/skaia/grpc/grengo"
)

type FrappeApp struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
}

// SiteInfo describes a single client visible to the dashboard.
type SiteInfo struct {
	Name     string   `json:"name"`
	Port     string   `json:"port"`
	Status   string   `json:"status"`
	Running  bool     `json:"running"`
	Armed    bool     `json:"armed"`
	Domains  []string `json:"domains"`
	DBName   string   `json:"db_name"`
	Features string   `json:"features"`
}

// CreateSiteParams holds everything needed to provision a new client.
type CreateSiteParams struct {
	Name           string   `json:"name"`
	Port           string   `json:"port"`
	Domains        []string `json:"domains"`
	DBName         string   `json:"db_name"`
	AdminPassword  string   `json:"admin_password"`
	AdminEmail     string   `json:"admin_email"`
	SessionTimeout string   `json:"session_timeout"`
	Environment    string   `json:"environment"`
	Features       string   `json:"features"`
}

// ListSites retrieves all sites from the grengo API.
func (s *Service) ListSites() ([]SiteInfo, error) {
	resp, err := s.client.ListSites(context.Background(), &pb.ListSitesRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var sites []SiteInfo
	if err := json.Unmarshal([]byte(resp.SitesJson), &sites); err != nil {
		return nil, fmt.Errorf("decode sites: %w", err)
	}
	if sites == nil {
		sites = []SiteInfo{}
	}
	return sites, nil
}

type execResponse struct {
	OK       bool   `json:"ok"`
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error"`
}

func (s *Service) exec(command string, args ...string) (*execResponse, error) {
	resp, err := s.client.Exec(context.Background(), &pb.ExecRequest{
		Command: command,
		Args:    args,
	})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}

	result := &execResponse{
		OK:       resp.Ok,
		Output:   resp.Output,
		ExitCode: int(resp.ExitCode),
		Error:    resp.Error,
	}
	if result.Error != "" {
		return nil, fmt.Errorf("grengo API: %s", result.Error)
	}
	return result, nil
}

func (s *Service) GetFrappeApps() ([]FrappeApp, error) {
	resp, err := s.client.GetFrappeApps(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, err
	}
	var apps []FrappeApp
	for _, app := range resp.Apps {
		apps = append(apps, FrappeApp{
			Name:        app.Name,
			Description: app.Description,
			Version:     app.Version,
		})
	}
	return apps, nil
}

func (s *Service) execOK(command string, args ...string) error {
	result, err := s.exec(command, args...)
	if err != nil {
		return err
	}
	if !result.OK {
		return fmt.Errorf("grengo %s failed (exit %d): %s", command, result.ExitCode, result.Output)
	}
	return nil
}

// CreateSite provisions a new client via the grengo API.
func (s *Service) CreateSite(p CreateSiteParams) error {
	if p.Name == "" {
		return fmt.Errorf("name is required")
	}

	args := []string{p.Name}
	for _, d := range p.Domains {
		args = append(args, "--domain", d)
	}
	if p.Port != "" {
		args = append(args, "--port", p.Port)
	}

	return s.execOK("new", args...)
}

// ProvisionFrappe provisions a new multi-tenant Frappe site using grengo on the host
func (s *Service) ProvisionFrappe(siteName string, onLog func(string)) error {
	_, err := s.provisionFrappeStream(siteName, "", onLog)
	return err
}

func (s *Service) provisionFrappeStream(siteName, version string, onLog func(string)) (string, error) {
	stream, err := s.client.ProvisionFrappe(context.Background(), &pb.ProvisionFrappeRequest{
		SiteName: siteName,
		Version:  version,
	})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}

	var output strings.Builder
	var pending string
	emit := func(line string) error {
		line = strings.TrimRight(line, "\r")
		output.WriteString(line)
		output.WriteByte('\n')
		if len(line) > 16 && line[:16] == "ERROR: exit code" {
			return fmt.Errorf("grengo frappe-provision failed: %s", line)
		} else if len(line) > 7 && line[:7] == "ERROR: " {
			return fmt.Errorf("grengo API: %s", line)
		}
		if onLog != nil {
			onLog(line)
		}
		return nil
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return output.String(), fmt.Errorf("reading stream: %w", err)
		}

		pending += resp.Output
		// Convert \r to \n so progress bars (like buildkit) are emitted line-by-line
		pending = strings.ReplaceAll(pending, "\r", "\n")
		parts := strings.Split(pending, "\n")
		pending = parts[len(parts)-1]
		for _, line := range parts[:len(parts)-1] {
			if err := emit(line); err != nil {
				return output.String(), err
			}
		}
	}
	if strings.TrimSpace(pending) != "" {
		if err := emit(pending); err != nil {
			return output.String(), err
		}
	}
	return output.String(), nil
}

type FrappeProvisionResult struct {
	Version  string
	Cluster  string
	HTTPPort int
	GRPCPort int
}

func (s *Service) ProvisionFrappeVersion(siteName, version string, onLog func(string)) (*FrappeProvisionResult, error) {
	if version == "" {
		version = "16"
	}
	
	output, err := s.provisionFrappeStream(siteName, version, onLog)
	if err != nil {
		return nil, err
	}

	out := &FrappeProvisionResult{Version: version}
	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		switch key {
		case "FRAPPE_CLUSTER_VERSION":
			out.Version = value
		case "FRAPPE_CLUSTER_ID":
			out.Cluster = value
		case "FRAPPE_HTTP_PORT":
			fmt.Sscanf(value, "%d", &out.HTTPPort)
		case "FRAPPE_GRPC_PORT":
			fmt.Sscanf(value, "%d", &out.GRPCPort)
		}
	}

	if out.Cluster == "" {
		out.Cluster = "1"
	}
	if out.GRPCPort == 0 {
		out.GRPCPort = 3001
	}
	if out.HTTPPort == 0 {
		out.HTTPPort = 8000
	}

	return out, nil
}

// DeleteSite removes a client via the grengo API.
func (s *Service) DeleteSite(name string) error { return s.execOK("remove", name) }

// StartSite starts a client backend via the grengo API.
func (s *Service) StartSite(name string) error { return s.execOK("start", name) }

// StopSite stops a client backend via the grengo API.
func (s *Service) StopSite(name string) error { return s.execOK("stop", name) }

// EnableSite re-enables a disabled client via the grengo API.
func (s *Service) EnableSite(name string) error { return s.execOK("enable", name) }

// DisableSite disables a client and stops its backend via the grengo API.
func (s *Service) DisableSite(name string) error { return s.execOK("disable", name) }

// ArmSite arms a client via the grengo API.
func (s *Service) ArmSite(name string) error {
	_, err := s.client.ArmSite(context.Background(), &pb.SiteRequest{Name: name})
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	return nil
}

// DisarmSite disarms a client via the grengo API.
func (s *Service) DisarmSite(name string) error {
	_, err := s.client.DisarmSite(context.Background(), &pb.SiteRequest{Name: name})
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	return nil
}

// GetSiteEnv retrieves the raw .env file content for a site.
func (s *Service) GetSiteEnv(name string) (string, error) {
	resp, err := s.client.GetSiteEnv(context.Background(), &pb.SiteRequest{Name: name})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	return resp.Content, nil
}

// UpdateSiteEnv overwrites the .env file for a site.
func (s *Service) UpdateSiteEnv(name, content string) error {
	_, err := s.client.UpdateSiteEnv(context.Background(), &pb.UpdateSiteEnvRequest{Name: name, Content: content})
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	return nil
}
