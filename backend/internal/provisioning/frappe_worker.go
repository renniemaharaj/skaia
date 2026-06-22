package provisioning

import (
	"fmt"

	"github.com/renniemaharaj/grouplogs/pkg/logger"
	igrengo "github.com/skaia/backend/internal/grengo"
	"github.com/skaia/backend/internal/utils"
)

func FrappeProvisionWorker(instanceID int64, configPayload []byte, l *logger.Logger, grengo *igrengo.Service) error {
	if grengo == nil {
		l.Error("grengo service is nil, cannot provision frappe")
		return fmt.Errorf("grengo service is nil")
	}

	siteName := fmt.Sprintf("site%d.%s", instanceID, utils.GetFrappeDomain())
	l.InfoF("Delegating Frappe provisioning for %s to host Grengo orchestrator...", siteName)

	if err := grengo.ProvisionFrappe(siteName, func(line string) {
		if line != "" {
			l.Info(line)
		}
	}); err != nil {
		l.ErrorF("Grengo provisioning failed: %v", err)
		return err
	}

	l.Success("Frappe Framework multi-tenant site successfully provisioned via Grengo and is now RUNNING.")
	return nil
}
