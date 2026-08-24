import type { ReactNode } from "react";
import { ModulePageShell } from "../layout/ModulePageShell";

interface DocumentationPageShellProps {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}

/** Route-depth shell for documentation authoring and settings pages. */
export function DocumentationPageShell({
  children,
  backTo = "/doc",
  backLabel = "Back to Documentation",
}: DocumentationPageShellProps) {
  return (
    <ModulePageShell backTo={backTo} backLabel={backLabel} width="wide">
      {children}
    </ModulePageShell>
  );
}
