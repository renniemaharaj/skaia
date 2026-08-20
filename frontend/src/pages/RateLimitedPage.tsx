import { Lock, ShieldCheck } from "lucide-react";
import React, { useState } from "react";
import type { FormikHelpers } from "formik";
import { toast } from "sonner";
import { FormField, FormSectionIntro, ManagedForm } from "../components/form";
import { type RateLimitDefconInfo, apiRequest } from "../utils/api";
import ErrorPage from "./ErrorPage";
import "../components/ui/FormGroup.css";
import "../components/auth/Auth.css";
import "./RateLimitedPage.css";

interface RateLimitedPageProps {
  retrySeconds?: number;
  challenge?: string;
  defconInfo?: RateLimitDefconInfo;
  onCleared?: () => void;
}

const RateLimitedPage: React.FC<RateLimitedPageProps> = ({
  retrySeconds,
  challenge,
  defconInfo,
  onCleared,
}) => {
  const canRequestPriorityAccess = challenge === "totp";
  const [showOverride, setShowOverride] = useState(canRequestPriorityAccess);
  const [timeLeft, setTimeLeft] = useState(retrySeconds || 0);

  React.useEffect(() => {
    if (timeLeft <= 0) {
      if (retrySeconds && timeLeft === 0) {
        onCleared?.();
      }
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, retrySeconds, onCleared]);

  const formatTime = (totalSeconds: number) => {
    if (totalSeconds < 60) {
      return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);

    return parts.join(" ");
  };

  const handleTotpSubmit = async (
    values: { code: string },
    helpers: FormikHelpers<{ code: string }>
  ) => {
    try {
      await apiRequest("/auth/bypass-rate-limit", {
        method: "POST",
        headers: { "X-TOTP-Code": values.code },
      });
      toast.success("Identity verified. Network access restored.");
      onCleared?.();
    } catch (err) {
      toast.error("Access denied. Invalid signature or insufficient clearance.");
    } finally {
      helpers.resetForm();
    }
  };

  const detailsNode = (
    <div className="rate-limited-details">
      <p>
        {timeLeft > 0
          ? `Please wait ${formatTime(timeLeft)} before trying again.`
          : "Please wait while the rate-limit window clears."}
      </p>

      {canRequestPriorityAccess && !showOverride && (
        <button
          type="button"
          onClick={() => setShowOverride(true)}
          className="rate-limited-override-btn"
        >
          <Lock size={12} /> Priority Access
        </button>
      )}

      {canRequestPriorityAccess && showOverride && (
        <ManagedForm
          id="rate-limit-override-form"
          className="rate-limited-form"
          variant="grouped"
          icon={<ShieldCheck size={18} />}
          title="Priority Access"
          description="Enter the six-digit administrator verification code."
          initialValues={{ code: "" }}
          validate={values => (values.code.length === 6 ? {} : { code: "Enter all six digits" })}
          onSubmit={handleTotpSubmit}
          submitDisabled={formik => formik.values.code.length !== 6}
          submitLabel="Authorize Bypass"
        >
          {formik => (
            <FormField
              id="totp_code"
              name="code"
              label="Priority Override Code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              icon={<ShieldCheck size={18} />}
              variant="grouped"
              disabled={formik.isSubmitting}
              onChange={event => {
                void formik.setFieldValue(
                  "code",
                  event.target.value.replace(/\D/g, "").slice(0, 6)
                );
              }}
            />
          )}
        </ManagedForm>
      )}

      {defconInfo && (
        <div style={{ alignSelf: "stretch", marginTop: "1rem" }}>
          <FormSectionIntro
            icon={<ShieldCheck size={18} />}
            title="Traffic guard status"
            description={`Active jails: ${defconInfo.ips_jailed} · Tracked signatures: ${defconInfo.distinct_ips_tracked} · Cleared citizens: ${defconInfo.citizens} · Dynamic threshold: ${defconInfo.limiter_state} req/m`}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <ErrorPage
        errorCode={429}
        errorTitle="Rate limit exceeded"
        errorMessage="The application has reached its request limit and is temporarily blocked."
        details={detailsNode}
        showBackButton={false}
        showHomeButton={false}
      />
    </>
  );
};

export default RateLimitedPage;
