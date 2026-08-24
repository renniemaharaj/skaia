import type { ReactNode } from "react";
import { ModulePageShell } from "../layout/ModulePageShell";
import "./ForumPageShell.css";

interface ForumPageShellProps {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}

/** Stable route-depth shell shared by forum directories, readers, and forms. */
export function ForumPageShell({
  children,
  backTo = "/forum",
  backLabel = "Back to Forum",
}: ForumPageShellProps) {
  return (
    <ModulePageShell
      className="forum-module-shell"
      backTo={backTo}
      backLabel={backLabel}
      width="wide"
    >
      {children}
    </ModulePageShell>
  );
}
