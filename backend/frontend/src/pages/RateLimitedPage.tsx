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
  onCleared?: () => void;
}

const RateLimitedPage: React.FC<RateLimitedPageProps> = ({ retrySeconds, challenge, onCleared }) => {
  const [showOverride, setShowOverride] = useState(challenge === "totp");
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) return;
    
    setIsSubmitting(true);
    try {
      await apiRequest("/auth/bypass-rate-limit", {
        method: "POST",
        headers: { "X-TOTP-Code": totpCode }
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
        {retrySeconds
          ? `Please wait ${retrySeconds} second${
              retrySeconds === 1 ? "" : "s"
            } before trying again.`
          : "Please wait while the rate-limit window clears."}
      </p>

      {!showOverride && (
        <button 
          onClick={() => setShowOverride(true)}
          className="rate-limited-override-btn"
        >
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
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                disabled={isSubmitting}
                autoFocus
                style={{ paddingLeft: "36px", letterSpacing: "0.1em" }}
              />
            </div>
          </div>
          
          <button type="submit" className="auth-button" disabled={isSubmitting || totpCode.length < 6} style={{ marginTop: "0.5rem", padding: "0.6rem" }}>
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
    <ErrorPage
      errorCode={429}
      errorTitle="Rate limit exceeded"
      errorMessage="The application has reached its request limit and is temporarily blocked."
      details={detailsNode}
      showBackButton={false}
      showHomeButton={false}
    />
  );
};

export default RateLimitedPage;
