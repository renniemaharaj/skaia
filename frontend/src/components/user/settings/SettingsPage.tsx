import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { currentUserAtom, hasPermissionAtom } from "../../../atoms/auth";
import { totpStatus } from "../../../utils/api";
import SecuritySettings from "../../auth/SecuritySettings";
import { ModulePageShell } from "../../layout/ModulePageShell";
import { useUserData } from "../useUserData";
import ProfileSettings from "./ProfileSettings";
import ExternalIdentitySettings from "./ExternalIdentitySettings";

export default function SettingsPage() {
  const { userId } = useParams();
  const location = useLocation();
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const effectiveUserId = userId || currentUser?.id?.toString();
  const routeExitPath = effectiveUserId ? `/users/${effectiveUserId}` : "/";
  const canManage = hasPermission("user.manage-others");

  const { user, setUser, loading, error } = useUserData(effectiveUserId, canManage);

  const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
  const [totpReload, setTotpReload] = useState(0);

  const isOwnProfile = String(currentUser?.id) === String(user?.id);
  const totpStatusUserId = user?.id && canManage && !isOwnProfile ? String(user.id) : undefined;

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
      <ModulePageShell backTo={routeExitPath} backLabel="Exit Settings" width="comfortable">
        <main className="managed-form modal" aria-label="Loading user settings">
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div className="skeleton" style={{ width: "30%", height: 12, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "100%", height: 36, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </main>
      </ModulePageShell>
    );
  }

  if (error || !user) {
    return (
      <ModulePageShell backTo={routeExitPath} backLabel="Exit Settings" width="comfortable">
        <main className="managed-form modal">
          <div
            style={{
              textAlign: "center",
              color: "var(--error-color)",
            }}
          >
            {error || "User not found"}
          </div>
        </main>
      </ModulePageShell>
    );
  }

  const isCanonicalFormRoute = location.pathname.startsWith("/form/user");
  const basePath = isCanonicalFormRoute
    ? `/form/user/${user.id}`
    : userId
      ? `/settings/users/${user.id}`
      : "/settings";
  const exitPath = `/users/${user.id}`;

  return (
    <ModulePageShell backTo={exitPath} backLabel="Exit Settings" width="comfortable">
      <Routes>
        <Route
          path="profile"
          element={
            <ProfileSettings
              user={user}
              isOwnProfile={isOwnProfile}
              setUser={setUser}
              basePath={basePath}
              exitPath={exitPath}
            />
          }
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
              basePath={basePath}
              exitPath={exitPath}
            />
          }
        />
        <Route
          path="identities"
          element={
            isOwnProfile ? (
              <ExternalIdentitySettings basePath={basePath} exitPath={exitPath} />
            ) : (
              <Navigate to={`${basePath}/profile`} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="profile" replace />} />
      </Routes>
    </ModulePageShell>
  );
}
