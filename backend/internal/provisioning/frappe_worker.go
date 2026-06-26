package provisioning

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/renniemaharaj/grouplogs/pkg/logger"
	igrengo "github.com/skaia/backend/internal/grengo"
	"github.com/skaia/backend/internal/utils"
)

func FrappeProvisionWorker(instanceID int64, configPayload []byte, l *logger.Logger, grengo *igrengo.Service) (*igrengo.FrappeProvisionResult, error) {
	if grengo == nil {
		l.Error("grengo service is nil, cannot provision frappe")
		return nil, fmt.Errorf("grengo service is nil")
	}

	siteName := utils.GetFrappeSiteName(instanceID)
	version := "16"
	var config map[string]interface{}
	_ = json.Unmarshal(configPayload, &config)
	if rawSiteName, ok := config["site_name"].(string); ok && rawSiteName != "" {
		siteName = rawSiteName
	}
	if rawVersion, ok := config["frappe_version"].(string); ok && rawVersion != "" {
		version = rawVersion
	}
	l.InfoF("Delegating Frappe %s provisioning for %s to host Grengo orchestrator...", version, siteName)

	result, err := grengo.ProvisionFrappeVersion(siteName, version, func(line string) {
		if line != "" {
			logProvisionLine(l, line)
		}
	})
	if err != nil {
		l.ErrorF("Grengo provisioning failed: %v", err)
		return nil, err
	}
	if result != nil {
		l.InfoF("Frappe cluster assigned: version=%s cluster=%s http=%d grpc=%d", result.Version, result.Cluster, result.HTTPPort, result.GRPCPort)
	}

	l.Success("Frappe Framework multi-tenant site successfully provisioned via Grengo and is now RUNNING.")
	return result, nil
}

func logProvisionLine(l *logger.Logger, line string) {
	for _, raw := range strings.Split(line, "\n") {
		msg := strings.TrimSpace(raw)
		if msg == "" {
			continue
		}
		lower := strings.ToLower(msg)
		switch {
		case strings.HasPrefix(lower, "error:") ||
			strings.HasPrefix(lower, "fatal:") ||
			strings.HasPrefix(lower, "panic:") ||
			strings.Contains(lower, " exit code ") ||
			strings.Contains(lower, " failed"):
			l.Error(msg)
		case strings.HasPrefix(lower, "warning:") || strings.HasPrefix(lower, "warn:"):
			l.Warning(msg)
		case strings.Contains(lower, "successfully") ||
			strings.Contains(lower, "success") ||
			strings.Contains(lower, " is now running"):
			l.Success(msg)
		default:
			l.Info(msg)
		}
	}
}
