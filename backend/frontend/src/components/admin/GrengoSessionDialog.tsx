import { useCallback, useRef, useState } from "react";
import { useGrengoShortcut } from "../../hooks/useGrengoShortcut";
import "./GrengoSessionDialog.css";

/**
 * Modal dialog triggered by Ctrl+G that prompts for the grengo passcode
 * and creates a temporary session on success.
 * Render this once at the app root (inside Router).
 */
export default function GrengoSessionDialog() {
  const { showDialog, loading, error, createSession, closeDialog } =
    useGrengoShortcut();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const p1InputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    if (p1 && p2) createSession(p1, p2);
  }, [p1, p2, createSession]);

  const handleClose = () => {
    setP1("");
    setP2("");
    closeDialog();
  };

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
