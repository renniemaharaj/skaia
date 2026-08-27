import "./EmptyState.css";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, actions, className }: EmptyStateProps) {
  return (
    <section
      className={`ui-empty-state${className ? ` ${className}` : ""}`}
      aria-label="Empty state"
    >
      {icon && (
        <span className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="ui-empty-state__title">{title}</h3>
      {description && <p className="ui-empty-state__description">{description}</p>}
      {actions && <div className="ui-empty-state__actions">{actions}</div>}
    </section>
  );
}
