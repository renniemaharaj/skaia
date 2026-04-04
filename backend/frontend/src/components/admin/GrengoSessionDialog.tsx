import { useCallback, useEffect, useRef, useState } from "react";
import { useGrengoShortcut } from "../../hooks/useGrengoShortcut";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom, currentUserAtom } from "../../atoms/auth";
import "./GrengoSessionDialog.css";

/**
 * Modal dialog triggered by Ctrl+G that prompts for the grengo passcode
 * and creates a temporary session on success.
 * When the site is armed, auto-opens for admins and shows a maintenance
 * overlay for non-admin visitors.
 * Render this once at the app root (inside Router).
 */
export default function GrengoSessionDialog() {
  const { showDialog, loading, error, armed, createSession, closeDialog } =
    useGrengoShortcut();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const p1InputRef = useRef<HTMLInputElement>(null);

  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(currentUserAtom);
  const isAdmin = isAuthenticated && user?.roles?.includes("admin");

  // Show maintenance overlay for non-admin users when armed
  const [showMaintenance, setShowMaintenance] = useState(false);
  useEffect(() => {
    const handler = () => {
      if (!isAdmin) setShowMaintenance(true);
    };
    // Check on mount via armed prop
    if (armed && !isAdmin) setShowMaintenance(true);
    window.addEventListener("site:armed", handler);
    return () => window.removeEventListener("site:armed", handler);
  }, [armed, isAdmin]);

  const handleSubmit = useCallback(() => {
    if (p1 && p2) createSession(p1, p2);
  }, [p1, p2, createSession]);

  const handleClose = () => {
    setP1("");
    setP2("");
    closeDialog();
  };

  if (showMaintenance) {
    return (
      <div className="grengo-maintenance-overlay">
        <div className="grengo-maintenance-card">
          <h2>Under Maintenance</h2>
          <p>
            This site is currently undergoing maintenance. Please check back
            shortly.
          </p>
        </div>
      </div>
    );
  }

  if (!showDialog) return null;

  return (
    <div className="grengo-session-overlay" onClick={handleClose}>
      <div
        className="grengo-session-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Grengo Access</h3>
        <p>
          Enter your server passcode to open a temporary management session.
        </p>

        {error && <div className="grengo-session-error">{error}</div>}

        <label>
          Passcode Part 1
          <input
            ref={p1InputRef}
            type="password"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            autoFocus
            disabled={loading}
          />
        </label>

        <label>
          Passcode Part 2
          <input
            type="password"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={loading}
          />
        </label>

        <div className="grengo-session-actions">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !p1 || !p2}
          >
            {loading ? "Verifying…" : "Open Session"}
          </button>
          <button className="btn" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
