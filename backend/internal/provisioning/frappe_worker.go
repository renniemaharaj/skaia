package provisioning

import (
	"encoding/json"
	"fmt"

	"github.com/renniemaharaj/grouplogs/pkg/logger"
	igrengo "github.com/skaia/backend/internal/grengo"
	"github.com/skaia/backend/internal/utils"
)

func FrappeProvisionWorker(instanceID int64, configPayload []byte, l *logger.Logger, grengo *igrengo.Service) (*igrengo.FrappeProvisionResult, error) {
	if grengo == nil {
		l.Error("grengo service is nil, cannot provision frappe")
		return nil, fmt.Errorf("grengo service is nil")
	}

	siteName := fmt.Sprintf("site%d.%s", instanceID, utils.GetFrappeDomain())
	version := "16"
	var config map[string]interface{}
	_ = json.Unmarshal(configPayload, &config)
	if rawVersion, ok := config["frappe_version"].(string); ok && rawVersion != "" {
		version = rawVersion
	}
	l.InfoF("Delegating Frappe %s provisioning for %s to host Grengo orchestrator...", version, siteName)

	result, err := grengo.ProvisionFrappeVersion(siteName, version, func(line string) {
		if line != "" {
			l.Info(line)
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
