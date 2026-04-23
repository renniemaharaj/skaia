import { useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Mail,
  AlertCircle,
  Loader,
  CheckCircle,
  Copy,
  Download,
} from "lucide-react";
import {
  totpSetup,
  totpEnable,
  totpDisable,
  resendVerificationEmail,
  adminEnableTOTP,
  adminDisableTOTP,
  type TOTPSetupResponse,
} from "../../utils/api";
import { toast } from "sonner";
import "./SecuritySettings.css";

interface SecuritySettingsProps {
  emailVerified: boolean;
  totpEnabled: boolean;
  onUpdate?: () => void;
  canManage?: boolean; // If true, this is an admin/power user managing another account
  managedUserId?: string;
  managedUsername?: string;
}

export default function SecuritySettings({
  emailVerified,
  totpEnabled,
  onUpdate,
  canManage = false,
  managedUserId,
  managedUsername,
}: SecuritySettingsProps) {
  // 2FA setup flow states
  const [setupData, setSetupData] = useState<TOTPSetupResponse | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // ── Admin/Power User Controls ──────────────────────────────────────
  // If managing another user, show a warning and allow privileged actions
  // ── Admin/Power User Controls ──────────────────────────────────────
  // If managing another user, show a warning and allow privileged actions
  const [adminSetupData, setAdminSetupData] =
    useState<TOTPSetupResponse | null>(null);
  const [adminSetupCode, setAdminSetupCode] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminBackupCodes, setAdminBackupCodes] = useState<string[] | null>(
    null,
  );

  const handleAdminStartSetup = async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const data = await totpSetup();
      setAdminSetupData(data);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminEnableTOTP = async () => {
    if (adminSetupCode.length !== 6) {
      setAdminError("Enter the 6-digit code from the authenticator app");
      return;
    }
    setAdminLoading(true);
    setAdminError(null);
    try {
      if (!managedUserId || !adminSetupData)
        throw new Error("Missing user or setup data");
      const res = await adminEnableTOTP(
        managedUserId,
        adminSetupData.secret,
        adminSetupCode,
      );
      setAdminBackupCodes(res.backup_codes);
      setAdminSetupData(null);
      setAdminSetupCode("");
      toast.success("2FA enabled for user");
      onUpdate?.();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminDisableTOTP = async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      if (!managedUserId) throw new Error("Missing user id");
      await adminDisableTOTP(managedUserId);
      toast.success("2FA disabled for user");
      onUpdate?.();
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : "Failed to disable 2FA",
      );
    } finally {
      setAdminLoading(false);
    }
  };

  if (canManage && managedUserId) {
    // Show backup codes after admin enables 2FA
    if (adminBackupCodes) {
      return (
        <div className="sec-panel">
          <div
            className="sec-panel__overlay"
            onClick={(e) =>
              e.target === e.currentTarget && setAdminBackupCodes(null)
            }
          >
            <div className="sec-panel__dialog">
              <h3>Save Backup Codes for {managedUsername}</h3>
              <div className="sec-panel__warning">
                Save these codes in a safe place. Each code can only be used
                once.
              </div>
              <div className="sec-panel__backup-codes">
                {adminBackupCodes.map((code, i) => (
                  <div key={i} className="sec-panel__backup-code">
                    {code}
                  </div>
                ))}
              </div>
              <div className="sec-panel__actions">
                <button
                  className="sec-panel__btn sec-panel__btn--primary"
                  onClick={() => setAdminBackupCodes(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Show admin TOTP setup dialog
    if (adminSetupData) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(adminSetupData.otpauth)}`;
      return (
        <div className="sec-panel">
          <div
            className="sec-panel__overlay"
            onClick={(e) =>
              e.target === e.currentTarget && setAdminSetupData(null)
            }
          >
            <div className="sec-panel__dialog">
              <h3>Set Up 2FA for {managedUsername}</h3>
              <p>
                Scan the QR code below with an authenticator app, then enter the
                6-digit code to verify.
              </p>
              <div className="sec-panel__qr">
                <img src={qrUrl} alt="TOTP QR Code" width={200} height={200} />
              </div>
              <p style={{ fontSize: "0.75rem" }}>
                Or enter this secret manually:
              </p>
              <div className="sec-panel__secret">{adminSetupData.secret}</div>
              {adminError && (
                <div className="sec-panel__error">
                  <AlertCircle size={14} />
                  <span>{adminError}</span>
                </div>
              )}
              <input
                className="sec-panel__input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={adminSetupCode}
                onChange={(e) =>
                  setAdminSetupCode(e.target.value.replace(/\D/g, ""))
                }
                autoFocus
              />
              <div className="sec-panel__actions">
                <button
                  className="sec-panel__btn sec-panel__btn--danger"
                  onClick={() => {
                    setAdminSetupData(null);
                    setAdminSetupCode("");
                    setAdminError(null);
                  }}
                  disabled={adminLoading}
                >
                  Cancel
                </button>
                <button
                  className="sec-panel__btn sec-panel__btn--primary"
                  onClick={handleAdminEnableTOTP}
                  disabled={adminLoading || adminSetupCode.length !== 6}
                >
                  {adminLoading ? (
                    <Loader size={14} className="spinning" />
                  ) : null}
                  Verify & Enable
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="sec-panel">
        <h2 className="sec-panel__title">Security (Manage User)</h2>
        <div className="sec-panel__section">
          <div className="sec-panel__section-header">
            <span className="sec-panel__section-title">
              <ShieldCheck size={16} />
              Two-Factor Authentication
            </span>
            {totpEnabled ? (
              <span className="sec-panel__badge sec-panel__badge--success">
                <ShieldCheck size={12} /> Enabled
              </span>
            ) : (
              <span className="sec-panel__badge sec-panel__badge--error">
                <ShieldOff size={12} /> Disabled
              </span>
            )}
          </div>
          <p className="sec-panel__section-desc">
            Manage 2FA for <b>{managedUsername}</b>. You may enable, disable, or
            reset 2FA and backup codes for this account.
          </p>
          <div className="sec-panel__actions">
            {totpEnabled ? (
              <button
                className="sec-panel__btn sec-panel__btn--danger"
                onClick={handleAdminDisableTOTP}
                disabled={adminLoading}
              >
                {adminLoading ? (
                  <Loader size={14} className="spinning" />
                ) : null}
                Disable 2FA
              </button>
            ) : (
              <button
                className="sec-panel__btn sec-panel__btn--primary"
                onClick={handleAdminStartSetup}
                disabled={adminLoading}
              >
                {adminLoading ? (
                  <Loader size={14} className="spinning" />
                ) : null}
                Enable 2FA
              </button>
            )}
            {/* TODO: Implement backup code and email verification admin actions */}
            <button
              className="sec-panel__btn sec-panel__btn--primary"
              onClick={() =>
                toast.info("TODO: Generate new backup codes (admin)")
              }
            >
              Generate Backup Codes
            </button>
            <button
              className="sec-panel__btn sec-panel__btn--primary"
              onClick={() =>
                toast.info("TODO: Setup email verification (admin)")
              }
            >
              Setup Email Verification
            </button>
          </div>
          {adminError && (
            <div className="sec-panel__error">
              <AlertCircle size={14} />
              <span>{adminError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  const handleResendVerification = async () => {
    setVerifyLoading(true);
    try {
      await resendVerificationEmail();
      toast.success("Verification email sent — check your inbox");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to send verification email",
      );
    } finally {
      setVerifyLoading(false);
    }
  };

  // ── 2FA Setup ───────────────────────────────────────────────────────
  const handleStartSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await totpSetup();
      setSetupData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTOTP = async () => {
    if (setupCode.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await totpEnable(setupCode);
      setBackupCodes(res.backup_codes);
      setSetupData(null);
      setSetupCode("");
      toast.success("Two-factor authentication enabled");
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTOTP = async () => {
    if (!disablePassword) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await totpDisable(disablePassword);
      setShowDisable(false);
      setDisablePassword("");
      toast.success("Two-factor authentication disabled");
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied to clipboard");
  };

  const downloadBackupCodes = () => {
    if (!backupCodes) return;
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skaia-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 0);
    toast.success("Backup codes downloaded");
  };

  // ── Backup codes display (shown once after enable) ──────────────────
  if (backupCodes) {
    return (
      <div className="sec-panel">
        <div
          className="sec-panel__overlay"
          onClick={(e) => e.target === e.currentTarget && setBackupCodes(null)}
        >
          <div className="sec-panel__dialog">
            <h3>Save Your Backup Codes</h3>
            <div className="sec-panel__warning">
              Save these codes in a safe place. Each code can only be used once.
              If you lose your authenticator app, these codes are the only way
              to access your account.
            </div>

            <div className="sec-panel__backup-codes">
              {backupCodes.map((code, i) => (
                <div key={i} className="sec-panel__backup-code">
                  {code}
                </div>
              ))}
            </div>

            <div className="sec-panel__actions">
              <button
                className="sec-panel__btn sec-panel__btn--primary"
                onClick={copyBackupCodes}
              >
                <Copy size={14} />
                Copy Codes
              </button>
              <button
                className="sec-panel__btn sec-panel__btn--primary"
                onClick={downloadBackupCodes}
              >
                <Download size={14} />
                Download Codes
              </button>
              <button
                className="sec-panel__btn sec-panel__btn--primary"
                onClick={() => setBackupCodes(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 2FA Setup dialog ────────────────────────────────────────────────
  if (setupData) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.otpauth)}`;

    return (
      <div className="sec-panel">
        <div
          className="sec-panel__overlay"
          onClick={(e) => e.target === e.currentTarget && setSetupData(null)}
        >
          <div className="sec-panel__dialog">
            <h3>Set Up Two-Factor Authentication</h3>
            <p>
              Scan the QR code below with your authenticator app (Google
              Authenticator, Authy, etc.), then enter the 6-digit code to
              verify.
            </p>

            <div className="sec-panel__qr">
              <img src={qrUrl} alt="TOTP QR Code" width={200} height={200} />
            </div>

            <p style={{ fontSize: "0.75rem" }}>
              Or enter this secret manually:
            </p>
            <div className="sec-panel__secret">{setupData.secret}</div>

            {error && (
              <div className="sec-panel__error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <input
              className="sec-panel__input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />

            <div className="sec-panel__actions">
              <button
                className="sec-panel__btn sec-panel__btn--danger"
                onClick={() => {
                  setSetupData(null);
                  setSetupCode("");
                  setError(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="sec-panel__btn sec-panel__btn--primary"
                onClick={handleEnableTOTP}
                disabled={loading || setupCode.length !== 6}
              >
                {loading ? <Loader size={14} className="spinning" /> : null}
                Verify & Enable
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Disable 2FA dialog ──────────────────────────────────────────────
  if (showDisable) {
    return (
      <div className="sec-panel">
        <div
          className="sec-panel__overlay"
          onClick={(e) => e.target === e.currentTarget && setShowDisable(false)}
        >
          <div className="sec-panel__dialog">
            <h3>Disable Two-Factor Authentication</h3>
            <p>Enter your password to confirm disabling 2FA.</p>

            {error && (
              <div className="sec-panel__error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <input
              className="sec-panel__input"
              type="password"
              placeholder="Current password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              style={{ letterSpacing: "normal", textAlign: "left" }}
              autoFocus
            />

            <div className="sec-panel__actions">
              <button
                className="sec-panel__btn sec-panel__btn--primary"
                onClick={() => {
                  setShowDisable(false);
                  setDisablePassword("");
                  setError(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="sec-panel__btn sec-panel__btn--danger"
                onClick={handleDisableTOTP}
                disabled={loading || !disablePassword}
              >
                {loading ? <Loader size={14} className="spinning" /> : null}
                Disable 2FA
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main panel ──────────────────────────────────────────────────────
  return (
    <div className="sec-panel">
      <h2 className="sec-panel__title">Security</h2>

      {/* Email Verification */}
      <div className="sec-panel__section">
        <div className="sec-panel__section-header">
          <span className="sec-panel__section-title">
            <Mail size={16} />
            Email Verification
          </span>
          {emailVerified ? (
            <span className="sec-panel__badge sec-panel__badge--success">
              <CheckCircle size={12} />
              Verified
            </span>
          ) : (
            <span className="sec-panel__badge sec-panel__badge--warning">
              Not Verified
            </span>
          )}
        </div>
        {!emailVerified && (
          <>
            <p className="sec-panel__section-desc">
              Verify your email address to secure your account and enable
              password recovery.
            </p>
            <button
              className="sec-panel__btn sec-panel__btn--primary"
              onClick={handleResendVerification}
              disabled={verifyLoading}
            >
              {verifyLoading ? (
                <Loader size={14} className="spinning" />
              ) : (
                <Mail size={14} />
              )}
              Send Verification Email
            </button>
          </>
        )}
      </div>

      {/* Two-Factor Authentication */}
      <div className="sec-panel__section">
        <div className="sec-panel__section-header">
          <span className="sec-panel__section-title">
            <ShieldCheck size={16} />
            Two-Factor Authentication
          </span>
          {totpEnabled ? (
            <span className="sec-panel__badge sec-panel__badge--success">
              <ShieldCheck size={12} />
              Enabled
            </span>
          ) : (
            <span className="sec-panel__badge sec-panel__badge--error">
              <ShieldOff size={12} />
              Disabled
            </span>
          )}
        </div>
        <p className="sec-panel__section-desc">
          {totpEnabled
            ? "Your account is protected with an authenticator app. You'll need your code to sign in."
            : "Add an extra layer of security by requiring a code from your authenticator app when signing in."}
        </p>
        {totpEnabled ? (
          <button
            className="sec-panel__btn sec-panel__btn--danger"
            onClick={() => {
              setShowDisable(true);
              setError(null);
            }}
          >
            <ShieldOff size={14} />
            Disable 2FA
          </button>
        ) : (
          <button
            className="sec-panel__btn sec-panel__btn--primary"
            onClick={handleStartSetup}
            disabled={loading}
          >
            {loading ? (
              <Loader size={14} className="spinning" />
            ) : (
              <ShieldCheck size={14} />
            )}
            Set Up 2FA
          </button>
        )}
      </div>
    </div>
  );
}
