import { createPortal } from "react-dom";
import Button from "../../ui/Button";
import Select from "../../ui/Select";
import type { DeploymentBlueprint, FrappeVersion } from "./types";

export interface NewDeploymentDialogProps {
  blueprints: DeploymentBlueprint[];
  frappeVersion: FrappeVersion;
  onFrappeVersionChange: (version: FrappeVersion) => void;
  onDeploy: (blueprintId: number, blueprintName: string) => void;
  onClose: () => void;
}

export function NewDeploymentDialog({
  blueprints,
  frappeVersion,
  onFrappeVersionChange,
  onDeploy,
  onClose,
}: NewDeploymentDialogProps) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content deployments-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-deployment-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="new-deployment-title">New Deployment</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close new deployment">
            ×
          </Button>
        </div>
        <div className="modal-body">
          <p className="modal-subtitle">
            Select an available blueprint to provision a new instance.
          </p>
          {blueprints.length === 0 ? (
            <p className="deployment-empty-state">No active blueprints currently available.</p>
          ) : (
            <div className="blueprint-grid">
              {blueprints.map(blueprint => (
                <div key={blueprint.id} className="blueprint-card">
                  <div>
                    <h4>{blueprint.name}</h4>
                    <p>{blueprint.description}</p>
                    {blueprint.name.toLowerCase().includes("frappe") && (
                      <div className="deployments-version-field">
                        <Select
                          size="sm"
                          block
                          value={frappeVersion}
                          aria-label="Frappe version"
                          onChange={event =>
                            onFrappeVersionChange(event.target.value as FrappeVersion)
                          }
                          options={[
                            { value: "16", label: "Stable 16" },
                            { value: "15", label: "Stable 15" },
                            { value: "17-dev", label: "Dev 17" },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => onDeploy(blueprint.id, blueprint.name)}>
                    Deploy {blueprint.name}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
