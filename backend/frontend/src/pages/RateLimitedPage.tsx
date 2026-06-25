import { Lock, ShieldCheck } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import { ContentStandOutCard } from "../components/cards/ContentStandOutCard";
import Button from "../components/input/Button";
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
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/auth/bypass-rate-limit", {
        method: "POST",
        headers: { "X-TOTP-Code": totpCode },
      });
      toast.success("Identity verified. Network access restored.");
      onCleared?.();
    } catch (err) {
      toast.error("Access denied. Invalid signature or insufficient clearance.");
    } finally {
      setIsSubmitting(false);
      setTotpCode("");
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
        <form onSubmit={handleTotpSubmit} className="rate-limited-form compact-form-card">
          <ContentStandOutCard className="form-group" emphasis="group">
            <label htmlFor="totp_code">Priority Override Code</label>
            <p className="form-help">Enter the six-digit administrator verification code.</p>
            <div className="input-wrapper">
              <ShieldCheck size={18} className="input-icon" />
              <input
                id="totp_code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                disabled={isSubmitting}
              />
            </div>
          </ContentStandOutCard>

          <Button
            type="submit"
            className="auth-button"
            variant="primary"
            loading={isSubmitting}
            disabled={totpCode.length < 6}
            block
          >
            Authorize Bypass
          </Button>
        </form>
      )}

      {defconInfo && (
        <div className="section__header" style={{ alignSelf: "stretch", marginTop: "1rem" }}>
          <ShieldCheck size={24} className="section__header-icon" aria-hidden="true" />
          <span className="section__header-eyebrow">Rate limit telemetry</span>
          <h2>Traffic guard status</h2>
          <p>
            Active jails: {defconInfo.ips_jailed} · Tracked signatures:{" "}
            {defconInfo.distinct_ips_tracked} · Cleared citizens: {defconInfo.citizens} · Dynamic
            threshold: {defconInfo.limiter_state} req/m
          </p>
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
