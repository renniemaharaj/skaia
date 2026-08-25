import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import "./SetupHub.css";

export interface SetupHubStatus {
  label: string;
  tone?: "complete" | "attention" | "neutral";
}

export function SetupHub({
  eyebrow,
  title,
  description,
  action,
  progress,
  children,
  busy,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  progress?: { completed: number; total: number; label: string; note?: string };
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="setup-hub" aria-busy={busy || undefined}>
      <header className="setup-hub__hero">
        <div className="setup-hub__hero-heading">
          <div>
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {action}
        </div>
        {progress && (
          <div className="setup-hub__progress">
            <div>
              <strong>
                {progress.completed} of {progress.total} {progress.label.toLowerCase()}
              </strong>
              <span>{progress.label}</span>
            </div>
            <progress
              value={progress.completed}
              max={progress.total || 1}
              aria-label={`${progress.completed} of ${progress.total} ${progress.label.toLowerCase()}`}
            />
            {progress.note && <small>{progress.note}</small>}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

export function SetupHubSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `setup-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="setup-hub__section" aria-labelledby={headingId}>
      <div className="setup-hub__section-heading">
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="setup-hub__grid">{children}</div>
    </section>
  );
}

export function SetupHubCard({
  to,
  title,
  description,
  icon: Icon,
  status,
  action,
}: {
  to: string;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  status?: SetupHubStatus;
  action?: ReactNode;
}) {
  return (
    <article className="setup-hub__card">
      <Link to={to} className="setup-hub__card-link">
        <span className="setup-hub__card-icon">
          <Icon size={20} />
        </span>
        <span className="setup-hub__card-copy">
          <span className="setup-hub__card-title">
            <h3>{title}</h3>
            {status && (
              <small className={`setup-hub__status setup-hub__status--${status.tone ?? "neutral"}`}>
                {status.label}
              </small>
            )}
          </span>
          <p>{description}</p>
        </span>
      </Link>
      {action && <div className="setup-hub__card-actions">{action}</div>}
    </article>
  );
}

export function SetupHubCallout({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <aside className="setup-hub__callout">
      <div>{children}</div>
      {action}
    </aside>
  );
}
