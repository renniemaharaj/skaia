import type { ReactNode } from "react";
import { ModulePageShell } from "../layout/ModulePageShell";
import "./StorePageShell.css";

interface StorePageShellProps {
  children?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function StorePageShell({
  children,
  title,
  subtitle,
  backTo,
  backLabel = "Back to Store",
  meta,
  actions,
  className = "",
}: StorePageShellProps) {
  return (
    <ModulePageShell
      className="store-page-shell"
      contentClassName={`store-page-shell__content ${className}`.trim()}
      title={title}
      subtitle={subtitle}
      backTo={backTo}
      backLabel={backLabel}
      meta={meta}
      actions={actions}
      width="wide"
    >
      {children}
    </ModulePageShell>
  );
}
