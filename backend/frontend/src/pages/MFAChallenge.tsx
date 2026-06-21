import { AlertCircle, ShieldCheck, Fingerprint } from "lucide-react";
import { useState } from "react";

import Button from "../components/input/Button";
import { ContentStandOutCard } from "../components/cards/ContentStandOutCard";
import { ContentFlatCard } from "../components/cards/ContentFlatCard";
import {
  type AuthResponse,
  type MFAChallengeReason,
  loginTOTP,
  verifyMFAChallenge,
} from "../utils/api";
import "../components/ui/FormGroup.css";
import "../components/auth/Auth.css";

interface MFAChallengeProps {
  totpToken: string;
  reasonCode?: MFAChallengeReason;
  action?: string;
  onBack?: () => void;
  onAuthSuccess?: (token: string, data?: AuthResponse) => void;
}

function challengeCopy(
  reasonCode: MFAChallengeReason | undefined,
  action: string | undefined,
	isLogin: boolean,
) {
  if (isLogin) {
    return {
      label: "Sign-in verification",
      detail: "Confirm this sign-in with your second factor.",
    };
  }
  switch (reasonCode) {
    case "ip_changed":
      return {
        label: "IP address changed",
        detail: "This session moved to a different network address.",
      };
    case "suspicious_activity":
			return {
				label: "Suspicious activity",
				detail: "A security review flagged this session.",
			};
    case "sensitive_action":
      return {
        label: action ? `Required to ${action}` : "Sensitive action",
        detail: "Fresh verification is required for this action.",
      };
    case "session_expired":
			return {
				label: "Session trust expired",
				detail: "This session needs fresh verification.",
			};
    default:
			return {
				label: "Authentication required",
				detail: "This session needs fresh verification.",
			};
  }
}

const MFAChallenge = ({
  totpToken,
  reasonCode,
  action,
  onBack,
  onAuthSuccess,
}: MFAChallengeProps) => {
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = challengeCopy(reasonCode, action, Boolean(totpToken));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (totpToken) {
        const data = await loginTOTP(
          totpToken,
          useBackupCode ? undefined : totpCode,
					useBackupCode ? totpCode : undefined,
        );
        if (onAuthSuccess) {
          onAuthSuccess(data.access_token, data);
        }
      } else {
        await verifyMFAChallenge(
          useBackupCode ? undefined : totpCode,
					useBackupCode ? totpCode : undefined,
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
				<ContentFlatCard className="auth-card auth-card--challenge">
          <div className="section__header auth-header">
            <Fingerprint
              size={24}
              className="auth-header-icon"
              aria-hidden="true"
            />
            <span className="auth-header-eyebrow">Why now: {reason.label}</span>
            <h1>Verify it's you</h1>
            <p>
              {useBackupCode
                ? "Use an unused backup code."
                : "Use your authenticator code."}
            </p>
          </div>

          <div className="section__content">


            {error && (
              <div className="auth-error">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

						<form
							onSubmit={handleSubmit}
							className="auth-form compact-form-card"
						>
              <ContentStandOutCard className="form-group" emphasis="group">
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
										onChange={(e) => setTotpCode(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </ContentStandOutCard>

              <div className="form-actions">
                <Button
                  type="submit"
                  className="auth-button"
                  variant="primary"
                  loading={loading}
                  block
                >
                  Verify
                </Button>
              </div>
            </form>

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
									{useBackupCode
										? "Use authenticator code"
										: "Use a backup code"}
                </button>
              </p>
              {onBack && (
                <p>
                  <button
                    type="button"
                    className="auth-toggle-btn"
                    onClick={onBack}
                    disabled={loading}
                  >
                    Back to login
                  </button>
                </p>
              )}
            </div>
          </div>
				</ContentFlatCard>

        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1" />
          <div className="decoration-circle decoration-circle-2" />
          <div className="decoration-circle decoration-circle-3" />
        </div>
      </div>
    </div>
  );
};

export default MFAChallenge;
