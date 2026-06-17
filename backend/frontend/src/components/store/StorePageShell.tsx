import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import "./StorePageShell.css";

interface StorePageShellProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export function StorePageShell({
  children,
  title,
  subtitle,
  backTo,
  backLabel = "Back to Store",
  actions,
  className = "",
}: StorePageShellProps) {
  const hasHeader = title || subtitle || actions;

  return (
    <div className={`store-page-shell ${className}`}>
      {backTo && (
        <div className="store-page-shell__back">
          <Link to={backTo} className="store-page-shell__back-link">
            <ArrowLeft size={14} />
            <span>{backLabel}</span>
          </Link>
        </div>
      )}

      {hasHeader && (
        <header className="store-page-shell__header">
          <div className="store-page-shell__heading">
            {title && <h1 className="store-page-shell__title">{title}</h1>}
            {subtitle && (
              <p className="store-page-shell__subtitle">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="store-page-shell__actions">{actions}</div>
          )}
        </header>
      )}

      {children}
    </div>
  );
}
