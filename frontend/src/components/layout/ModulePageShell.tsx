import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import "./ModulePageShell.css";

export interface ModulePageTab {
  to: string;
  label: ReactNode;
  end?: boolean;
}

interface ModulePageShellProps {
  children?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ModulePageTab[];
  navigationLabel?: string;
  width?: "comfortable" | "wide";
  className?: string;
  contentClassName?: string;
}

/** Shared route-depth shell for a module and all of its child pages. */
export function ModulePageShell({
  children,
  title,
  subtitle,
  backTo,
  backLabel = "Back",
  meta,
  actions,
  tabs,
  navigationLabel = "Module sections",
  width = "wide",
  className = "",
  contentClassName = "",
}: ModulePageShellProps) {
  const hasHeader = title || subtitle || actions;
  const hasBar = backTo || meta;

  return (
    <div className={`module-page-shell module-page-shell--${width} ${className}`.trim()}>
      {hasBar && (
        <div className="module-page-shell__bar">
          {backTo ? (
            <Link to={backTo} className="module-page-shell__back-link">
              <ArrowLeft size={14} aria-hidden="true" />
              <span>{backLabel}</span>
            </Link>
          ) : (
            <span />
          )}
          {meta && <div className="module-page-shell__meta">{meta}</div>}
        </div>
      )}

      {tabs && tabs.length > 0 && <ModuleTabs tabs={tabs} navigationLabel={navigationLabel} />}

      {hasHeader && (
        <header className="module-page-shell__header">
          <div className="module-page-shell__heading">
            {title && <h1 className="module-page-shell__title">{title}</h1>}
            {subtitle && <p className="module-page-shell__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="module-page-shell__actions">{actions}</div>}
        </header>
      )}

      <div className={`module-page-shell__content ${contentClassName}`.trim()}>{children}</div>
    </div>
  );
}

function ModuleTabs({
  tabs,
  navigationLabel,
}: {
  tabs: ModulePageTab[];
  navigationLabel: string;
}) {
  const location = useLocation();
  return (
    <nav className="module-page-shell__tabs" aria-label={navigationLabel}>
      {tabs.map(tab => {
        const active = tab.end
          ? location.pathname === tab.to
          : location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`module-page-shell__tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
