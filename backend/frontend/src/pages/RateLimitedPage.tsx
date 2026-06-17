import React, { useState } from "react";
import ErrorPage from "./ErrorPage";
import { apiRequest } from "../utils/api";
import { toast } from "sonner";
import { Lock, Loader, ShieldCheck } from "lucide-react";
import "../components/ui/FormGroup.css";
import "../components/auth/Auth.css";
import "./RateLimitedPage.css";

interface RateLimitedPageProps {
  retrySeconds?: number;
  challenge?: string;
  defconInfo?: any;
  onCleared?: () => void;
}

const RateLimitedPage: React.FC<RateLimitedPageProps> = ({
  retrySeconds,
  challenge,
  defconInfo,
  onCleared,
}) => {
  const [showOverride, setShowOverride] = useState(challenge === "totp");
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
      <p style={{ margin: 0 }}>
        {timeLeft > 0
          ? `Please wait ${formatTime(timeLeft)} before trying again.`
          : "Please wait while the rate-limit window clears."}
      </p>

      {/* DEFCON Info is now rendered as a fixed tile at the root level of the component */}

      <div
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
          margin: "1.5rem 0",
        }}
      />

      {!showOverride && (
        <button onClick={() => setShowOverride(true)} className="rate-limited-override-btn">
          <Lock size={12} /> Priority Access
        </button>
      )}

      {showOverride && (
        <form onSubmit={handleTotpSubmit} className="rate-limited-form">
          <div className="form-group" style={{ marginBottom: "0.5rem", textAlign: "left" }}>
            <label htmlFor="totp_code" style={{ fontSize: "0.8rem", opacity: 0.8 }}>
              Priority Override Code
            </label>
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
                autoFocus
                style={{ paddingLeft: "36px", letterSpacing: "0.1em" }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="auth-button"
            disabled={isSubmitting || totpCode.length < 6}
            style={{ marginTop: "0.5rem", padding: "0.6rem" }}
          >
            {isSubmitting ? (
              <>
                <Loader size={16} className="spinning" />
                Verifying...
              </>
            ) : (
              "Authorize Bypass"
            )}
          </button>
        </form>
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
      {defconInfo && (
        <div
          className="defcon-telemetry-tile"
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            width: "260px",
            padding: "1rem",
            background: "var(--bg-secondary, rgba(0, 0, 0, 0.8))",
            border: "1px solid var(--border-color, rgba(255, 60, 60, 0.3))",
            borderRadius: "6px",
            fontSize: "0.85rem",
            textAlign: "left",
            fontFamily: "var(--font-mono, monospace)",
            boxShadow: "var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.5))",
            backdropFilter: "blur(10px)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              marginBottom: "1rem",
              fontWeight: 700,
              color: "var(--text-primary, rgba(255, 80, 80, 0.9))",
              letterSpacing: "1px",
              textTransform: "uppercase",
              borderBottom: "1px dashed var(--border-color, rgba(255, 60, 60, 0.3))",
              paddingBottom: "0.5rem",
            }}
          >
            [ DEFCON THREAT TELEMETRY ]
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <span style={{ color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
              › Active Jails:
            </span>
            <strong style={{ color: "var(--text-primary, #fff)" }}>{defconInfo.ips_jailed}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <span style={{ color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
              › Tracked Signatures:
            </span>
            <strong style={{ color: "var(--text-primary, #e0e0e0)" }}>
              {defconInfo.distinct_ips_tracked}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <span style={{ color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
              › Cleared Citizens:
            </span>
            <strong style={{ color: "var(--text-primary, #55ff55)" }}>{defconInfo.citizens}</strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px dashed var(--border-color, rgba(255, 60, 60, 0.2))",
            }}
          >
            <span style={{ color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
              › Dynamic Threshold:
            </span>
            <strong style={{ color: "var(--text-primary, #ffaa00)" }}>
              {defconInfo.limiter_state} req/m
            </strong>
          </div>
        </div>
      )}
    </>
  );
};

export default RateLimitedPage;
