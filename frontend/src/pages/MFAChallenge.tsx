import { Fingerprint, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormikHelpers } from "formik";

import { FormField, ManagedForm } from "../components/form";
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
  isLogin: boolean
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
  const [useBackupCode, setUseBackupCode] = useState(false);
  const reason = challengeCopy(reasonCode, action, Boolean(totpToken));

  const handleSubmit = async (
    values: { code: string },
    helpers: FormikHelpers<{ code: string }>
  ) => {
    helpers.setStatus(undefined);
    try {
      if (totpToken) {
        const data = await loginTOTP(
          totpToken,
          useBackupCode ? undefined : values.code,
          useBackupCode ? values.code : undefined
        );
        if (onAuthSuccess) {
          onAuthSuccess(data.access_token, data);
        }
      } else {
        await verifyMFAChallenge(
          useBackupCode ? undefined : values.code,
          useBackupCode ? values.code : undefined
        );
        if (onAuthSuccess) {
          onAuthSuccess("");
        }
      }
    } catch (err) {
      helpers.setStatus(err instanceof Error ? err.message : "Invalid code");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <ManagedForm
          id="mfa-challenge-form"
          className="auth-card auth-card--challenge"
          formClassName="auth-form"
          variant="grouped"
          icon={<Fingerprint size={18} />}
          eyebrow={`Why now: ${reason.label}`}
          title="Verify it's you"
          description={
            useBackupCode ? "Use an unused backup code." : "Use your authenticator code."
          }
          initialValues={{ code: "" }}
          validate={values => (!values.code ? { code: "Verification code is required" } : {})}
          onSubmit={handleSubmit}
          submitLabel="Verify"
          afterActions={formik => (
            <div className="auth-toggle">
              <p>
                <button
                  type="button"
                  className="auth-toggle-btn"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    formik.resetForm();
                  }}
                  disabled={formik.isSubmitting}
                >
                  {useBackupCode ? "Use authenticator code" : "Use a backup code"}
                </button>
              </p>
              {onBack && (
                <p>
                  <button
                    type="button"
                    className="auth-toggle-btn"
                    onClick={onBack}
                    disabled={formik.isSubmitting}
                  >
                    Back to login
                  </button>
                </p>
              )}
            </div>
          )}
        >
          {formik => (
            <FormField
              id="totp_code"
              name="code"
              label={useBackupCode ? "Backup Code" : "Verification Code"}
              type="text"
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
              maxLength={useBackupCode ? 9 : 6}
              icon={<ShieldCheck size={20} />}
              variant="grouped"
              disabled={formik.isSubmitting}
            />
          )}
        </ManagedForm>

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
