import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import "./SideRouteShell.css";

export interface SideRouteTab {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  match?: string;
  end?: boolean;
}

interface SideRouteShellProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: SideRouteTab[];
  className?: string;
  contentClassName?: string;
}

export function SideRouteShell({
  children,
  title,
  subtitle,
  backTo = "/",
  backLabel = "Exit",
  meta,
  actions,
  tabs,
  className = "",
  contentClassName = "",
}: SideRouteShellProps) {
  const location = useLocation();
  const hasTabs = tabs && tabs.length > 0;

  return (
    <div className={`side-route-shell ${className}`}>
      <div className="side-route-shell__bar">
        <Link to={backTo} className="side-route-shell__back-link">
          <ArrowLeft size={14} />
          <span>{backLabel}</span>
        </Link>
        {meta && <div className="side-route-shell__meta">{meta}</div>}
      </div>

      {(title || subtitle || actions) && (
        <header className="side-route-shell__header">
          <div className="side-route-shell__heading">
            {title && <h1 className="side-route-shell__title">{title}</h1>}
            {subtitle && <p className="side-route-shell__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="side-route-shell__actions">{actions}</div>}
        </header>
      )}

      <div className={`side-route-shell__body${hasTabs ? " side-route-shell__body--tabs" : ""}`}>
        {hasTabs && (
          <nav className="side-route-shell__tabs" aria-label="Section navigation">
            {tabs.map(tab => {
              const matchPath = tab.match ?? tab.to;
              const active = tab.end
                ? location.pathname === matchPath
                : location.pathname.startsWith(matchPath);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`side-route-shell__tab${active ? " side-route-shell__tab--active" : ""}`}
                >
                  {tab.icon && <span className="side-route-shell__tab-icon">{tab.icon}</span>}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        <main className={`side-route-shell__content ${contentClassName}`}>{children}</main>
      </div>
    </div>
  );
}
