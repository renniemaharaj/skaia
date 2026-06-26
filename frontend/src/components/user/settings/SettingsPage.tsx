import { useAtomValue, useSetAtom } from "jotai";
import { ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { currentUserAtom, hasPermissionAtom } from "../../../atoms/auth";
import { layoutModeAtom } from "../../../atoms/layoutMode";
import { totpStatus } from "../../../utils/api";
import SecuritySettings from "../../auth/SecuritySettings";
import { SideRouteShell } from "../../layout/SideRouteShell";
import { useUserData } from "../useUserData";
import ProfileSettings from "./ProfileSettings";

export default function SettingsPage() {
  const { userId } = useParams();
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const setLayoutMode = useSetAtom(layoutModeAtom);

  const effectiveUserId = userId || currentUser?.id?.toString();
  const canManage = hasPermission("user.manage-others");

  const { user, setUser, loading, error } = useUserData(effectiveUserId, canManage);

  const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
  const [totpReload, setTotpReload] = useState(0);

  const isOwnProfile = String(currentUser?.id) === String(user?.id);
  const totpStatusUserId = user?.id && canManage && !isOwnProfile ? String(user.id) : undefined;

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  useEffect(() => {
    if (!user?.id) return;
    void totpReload;
    let mounted = true;

    const fetchTotpStatus = async () => {
      try {
        const status = await totpStatus(totpStatusUserId);
        if (mounted) {
          setTotpEnabled(status.enabled);
        }
      } catch (err) {
        if (mounted) {
          setTotpEnabled(false);
        }
      }
    };

    fetchTotpStatus();
    return () => {
      mounted = false;
    };
  }, [user?.id, totpStatusUserId, totpReload]);

  if (loading) {
    return (
      <SideRouteShell title="User Settings" backLabel="Exit">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div className="skeleton" style={{ width: "30%", height: 12, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "100%", height: 36, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </SideRouteShell>
    );
  }

  if (error || !user) {
    return (
      <SideRouteShell title="User Settings" backLabel="Exit">
        <div
          style={{
            textAlign: "center",
            color: "var(--error-color)",
          }}
        >
          {error || "User not found"}
        </div>
      </SideRouteShell>
    );
  }

  const basePath = userId ? `/settings/users/${user.id}` : "/settings";
  const exitPath = `/users/${user.id}`;

  return (
    <SideRouteShell
      title="User Settings"
      subtitle={
        <>Manage settings and preferences for {isOwnProfile ? "your account" : user.username}.</>
      }
      backTo={exitPath}
      backLabel="Exit"
      tabs={[
        {
          to: `${basePath}/profile`,
          match: `${basePath}/profile`,
          label: "Profile",
          icon: <UserRound size={15} />,
        },
        {
          to: `${basePath}/security`,
          match: `${basePath}/security`,
          label: "Security",
          icon: <ShieldCheck size={15} />,
        },
      ]}
    >
      <Routes>
        <Route
          path="profile"
          element={<ProfileSettings user={user} isOwnProfile={isOwnProfile} setUser={setUser} />}
        />
        <Route
          path="security"
          element={
            <SecuritySettings
              emailVerified={user.email_verified ?? false}
              totpEnabled={totpEnabled}
              onUpdate={() => setTotpReload(n => n + 1)}
              canManage={canManage && !isOwnProfile}
              managedUserId={canManage && !isOwnProfile ? String(user.id) : undefined}
              managedUsername={canManage && !isOwnProfile ? user.username : undefined}
            />
          }
        />
        <Route path="*" element={<Navigate to="profile" replace />} />
      </Routes>
    </SideRouteShell>
  );
}
