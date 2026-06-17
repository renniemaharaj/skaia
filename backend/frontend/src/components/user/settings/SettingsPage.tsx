import { useEffect, useState } from "react";
import {
  Link,
  Routes,
  Route,
  useLocation,
  Navigate,
  useParams,
} from "react-router-dom";
import { useAtomValue } from "jotai";
import SecuritySettings from "../../auth/SecuritySettings";
import ProfileSettings from "./ProfileSettings";
import { currentUserAtom, hasPermissionAtom } from "../../../atoms/auth";
import { useUserData } from "../useUserData";
import { totpStatus } from "../../../utils/api";

export default function SettingsPage() {
  const location = useLocation();
  const { userId } = useParams();
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const effectiveUserId = userId || currentUser?.id?.toString();
  const canManage = hasPermission("user.manage-others");

  const { user, setUser, loading, error } = useUserData(
    effectiveUserId,
    canManage,
  );

  const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
  const [totpReload, setTotpReload] = useState(0);

  const isOwnProfile = String(currentUser?.id) === String(user?.id);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const fetchTotpStatus = async () => {
      try {
        const status = await totpStatus(
          canManage && !isOwnProfile ? String(user.id) : undefined,
        );
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
  }, [user?.id, canManage, isOwnProfile, totpReload]);

  if (loading) {
    return (
      <div className="page-shell">
        <div style={{ padding: "2rem", textAlign: "center" }}>
          Loading settings...
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="page-shell">
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--error-color)",
          }}
        >
          {error || "User not found"}
        </div>
      </div>
    );
  }

  const basePath = userId ? `/settings/users/${user.id}` : "/settings";

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="page-header__main">
          <div>
            <h1 className="page-title">User Settings</h1>
            <p className="page-subtitle">
              Manage settings and preferences for{" "}
              {isOwnProfile ? "your account" : user.username}.
            </p>
          </div>
        </div>
      </header>

      <div
        className="settings-grid grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        <aside style={{ gridColumn: "1 / -1" }} className="settings-sidebar">
          <div className="ui-panel" style={{ padding: "1rem" }}>
            <nav style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <Link
                to={`${basePath}/profile`}
                className={`btn ${location.pathname.includes("/profile") ? "btn-primary" : "btn-ghost"}`}
                style={{
                  flex: "1 1 auto",
                  justifyContent: "center",
                  fontSize: "0.95rem",
                }}
              >
                Profile
              </Link>
              <Link
                to={`${basePath}/security`}
                className={`btn ${location.pathname.includes("/security") ? "btn-primary" : "btn-ghost"}`}
                style={{
                  flex: "1 1 auto",
                  justifyContent: "center",
                  fontSize: "0.95rem",
                }}
              >
                Security
              </Link>
            </nav>
          </div>
        </aside>

        <main
          className="ui-panel settings-main"
          style={{ gridColumn: "1 / -1", padding: "2rem", minHeight: "400px" }}
        >
          <Routes>
            <Route
              path="profile"
              element={
                <ProfileSettings
                  user={user}
                  isOwnProfile={isOwnProfile}
                  setUser={setUser}
                />
              }
            />
            <Route
              path="security"
              element={
                <SecuritySettings
                  emailVerified={user.email_verified ?? false}
                  totpEnabled={totpEnabled}
                  onUpdate={() => setTotpReload((n) => n + 1)}
                  canManage={canManage && !isOwnProfile}
                  managedUserId={
                    canManage && !isOwnProfile ? String(user.id) : undefined
                  }
                  managedUsername={
                    canManage && !isOwnProfile ? user.username : undefined
                  }
                />
              }
            />
            <Route path="*" element={<Navigate to="profile" replace />} />
          </Routes>
        </main>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .settings-grid {
            grid-template-columns: 250px 1fr !important;
          }
          .settings-sidebar {
            grid-column: 1 / 2 !important;
          }
          .settings-sidebar nav {
            flex-direction: column !important;
          }
          .settings-sidebar nav a {
            justify-content: flex-start !important;
          }
          .settings-main {
            grid-column: 2 / -1 !important;
          }
        }
      `}</style>
    </div>
  );
}
