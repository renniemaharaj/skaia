import { useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Mail,
  AlertCircle,
  Loader,
  CheckCircle,
  Copy,
} from "lucide-react";
import {
  totpSetup,
  totpEnable,
  totpDisable,
  resendVerificationEmail,
  type TOTPSetupResponse,
} from "../../utils/api";
import { toast } from "sonner";
import "./SecuritySettings.css";

interface SecuritySettingsProps {
  emailVerified: boolean;
  totpEnabled: boolean;
  onUpdate?: () => void;
}

export default function SecuritySettings({
  emailVerified,
  totpEnabled,
  onUpdate,
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

  // ── Email Verification ──────────────────────────────────────────────
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
