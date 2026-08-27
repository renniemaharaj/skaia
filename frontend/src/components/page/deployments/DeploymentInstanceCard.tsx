import { Play, RefreshCw, Server, Square, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import Button from "../../ui/Button";
import type { DeploymentBlueprint, DeploymentInstance } from "./types";

interface DeploymentInstanceCardProps {
  instance: DeploymentInstance;
  blueprints: DeploymentBlueprint[];
  onToggle: (id: number) => void;
  onStart: (id: number) => void;
  onRestart: (id: number) => void;
  onStop: (id: number) => void;
  onDelete: (id: number) => void;
}

export function DeploymentInstanceCard({
  instance,
  blueprints,
  onToggle,
  onStart,
  onRestart,
  onStop,
  onDelete,
}: DeploymentInstanceCardProps) {
  const stopPropagation = (action: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };
  const statusClass =
    instance.status === "running"
      ? "completed"
      : instance.status === "failed"
        ? "failed"
        : "pending";
  return (
    <div className="ds-card" onClick={() => onToggle(instance.id)}>
      <div className="ds-card__header">
        <div className="ds-card__title-row">
          <Server size={16} className="ds-card__type-icon" />
          <h3 className="ds-card__title">Instance #{instance.id}</h3>
        </div>
        <div className="deployment-card-actions">
          {instance.status === "stopped" && (
            <Button
              size="icon"
              aria-label="Start"
              onClick={stopPropagation(() => onStart(instance.id))}
            >
              <Play size={14} />
            </Button>
          )}
          {instance.status === "running" && (
            <>
              <Button
                size="icon"
                aria-label="Restart"
                onClick={stopPropagation(() => onRestart(instance.id))}
              >
                <RefreshCw size={14} />
              </Button>
              <Button
                size="icon"
                variant="danger"
                aria-label="Stop"
                onClick={stopPropagation(() => onStop(instance.id))}
              >
                <Square size={14} />
              </Button>
            </>
          )}
          <Button
            size="icon"
            variant="danger"
            aria-label="Delete"
            onClick={stopPropagation(() => onDelete(instance.id))}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <p className="ds-card__desc">
        Blueprint:{" "}
        {blueprints.find(item => item.id === instance.blueprint_id)?.name ||
          `ID ${instance.blueprint_id}`}
      </p>
      <div className="ds-card__meta">
        <span className={`deployment-status deployment-status--${statusClass}`}>
          {instance.status.toUpperCase()}
        </span>
        {instance.config_payload.url && (
          <a
            href={instance.config_payload.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={event => event.stopPropagation()}
          >
            {instance.config_payload.url.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
    </div>
  );
}
