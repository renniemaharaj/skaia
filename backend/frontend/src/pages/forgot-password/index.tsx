import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Mail,
  AlertCircle,
  Loader,
  CheckCircle,
  ServerOff,
} from "lucide-react";
import { forgotPassword } from "../../utils/api";
import "../../components/auth/Auth.css";
import "../../components/ui/FormGroup.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [emailUnavailable, setEmailUnavailable] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailUnavailable(false);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.toLowerCase().includes("email service not configured")) {
        setEmailUnavailable(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Reset Password</h1>
            <p>
              {sent
                ? "Check your email for a reset link"
                : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {emailUnavailable ? (
            <div className="auth-error">
              <ServerOff size={20} />
              <span>
                Email is not configured on this server. Please contact an
                administrator to reset your password.
              </span>
            </div>
          ) : sent ? (
            <div className="auth-success">
              <CheckCircle size={20} />
              <span>
                If an account with that email exists, we've sent a password
                reset link. Please check your inbox.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={20} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          )}

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-toggle">
            <p>
              Remember your password?
              <Link to="/login" className="auth-toggle-btn">
                Log in
              </Link>
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
}
