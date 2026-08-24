import type { ReactNode } from "react";
import { ModulePageShell } from "../../components/layout/ModulePageShell";

const communityTabs = [
  { to: "/community/proposal", label: "Proposals" },
  { to: "/community/showcase", label: "Showcases" },
  { to: "/community/event", label: "Events" },
];

interface CommunityModuleShellProps {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
  comfortable?: boolean;
  showTabs?: boolean;
  className?: string;
}

export function CommunityModuleShell({
  children,
  backTo,
  backLabel,
  comfortable = false,
  showTabs = true,
  className = "",
}: CommunityModuleShellProps) {
  return (
    <ModulePageShell
      className={`community-module-shell ${className}`.trim()}
      backTo={backTo}
      backLabel={backLabel}
      tabs={showTabs ? communityTabs : undefined}
      navigationLabel="Community sections"
      width={comfortable ? "comfortable" : "wide"}
    >
      {children}
    </ModulePageShell>
  );
}
