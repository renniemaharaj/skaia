import { useState } from "react";
import { ShieldCheck, AlertCircle, Loader } from "lucide-react";

import { loginTOTP, verifyMFAChallenge, type AuthResponse } from "../utils/api";
import "../components/ui/FormGroup.css";
import "../components/auth/Auth.css";

interface MFAChallengeProps {
  totpToken: string;
  onBack?: () => void;
  onAuthSuccess?: (token: string, data?: AuthResponse) => void;
}

const MFAChallenge = ({ totpToken, onBack, onAuthSuccess }: MFAChallengeProps) => {
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (totpToken) {
        const data = await loginTOTP(
          totpToken,
          useBackupCode ? undefined : totpCode,
          useBackupCode ? totpCode : undefined
        );
        if (onAuthSuccess) {
          onAuthSuccess(data.access_token, data);
        }
      } else {
        await verifyMFAChallenge(
          useBackupCode ? undefined : totpCode,
          useBackupCode ? totpCode : undefined
        );
        if (onAuthSuccess) {
          onAuthSuccess("");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <ShieldCheck size={40} style={{ color: "var(--primary-color)", marginBottom: 8 }} />
            <h1>Two-Factor Authentication</h1>
            <p>
              {useBackupCode
                ? "Enter one of your backup codes"
                : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="totp_code">
                {useBackupCode ? "Backup Code" : "Verification Code"}
              </label>
              <div className="input-wrapper">
                <ShieldCheck size={20} className="input-icon" />
                <input
                  id="totp_code"
                  type="text"
                  inputMode={useBackupCode ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
                  maxLength={useBackupCode ? 9 : 6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value)}
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? (
                <>
                  <Loader size={20} className="spinning" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-toggle">
            <p>
              <button
                type="button"
                className="auth-toggle-btn"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setTotpCode("");
                  setError(null);
                }}
                disabled={loading}
              >
                {useBackupCode ? "Use authenticator code" : "Use a backup code"}
              </button>
            </p>
            <p style={{ marginTop: 8 }}>
              <button type="button" className="auth-toggle-btn" onClick={onBack} disabled={loading}>
                Back to login
              </button>
            </p>
          </div>
        </div>

        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1"></div>
          <div className="decoration-circle decoration-circle-2"></div>
          <div className="decoration-circle decoration-circle-3"></div>
        </div>
      </div>
    </div>
  );
};

export default MFAChallenge;
