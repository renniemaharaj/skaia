import { AlertCircle, CheckCircle, Lock } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../utils/api";
import Button from "../input/Button";
import "./Auth.css";
import "../ui/FormGroup.css";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <section className="section auth-card" style={{ textAlign: "center" }}>
            <div className="section__content">
              <CheckCircle size={40} style={{ color: "var(--success-color)", marginBottom: 16 }} />
              <h2 style={{ margin: "0 0 12px" }}>Password Reset</h2>
              <p style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}>
                Your password has been changed. You can now log in with your new password.
              </p>
              <div className="form-actions" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-button"
                  onClick={() => navigate("/login")}
                  style={{ display: "inline-flex" }}
                >
                  Go to Login
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <section className="section auth-card">
          <div className="section__header auth-header">
            <h1>Set New Password</h1>
            <p>Enter your new password below</p>
          </div>

          <div className="section__content">
            {error && (
              <div className="auth-error">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form compact-form-card">
              <div className="form-group">
                <label htmlFor="password">New Password</label>
                <p className="form-help">Choose a unique password you do not use elsewhere.</p>
                <div className="input-wrapper">
                  <Lock size={20} className="input-icon" />
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="confirm">Confirm Password</label>
                <p className="form-help">Enter the new password again.</p>
                <div className="input-wrapper">
                  <Lock size={20} className="input-icon" />
                  <input
                    id="confirm"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-actions">
                <Button
                  type="submit"
                  className="auth-button"
                  variant="primary"
                  loading={loading}
                  block
                >
                  Reset Password
                </Button>
              </div>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <div className="auth-toggle">
              <p>
                <Link to="/login" className="auth-toggle-btn">
                  Back to Login
                </Link>
              </p>
            </div>
          </div>
        </section>

        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1" />
          <div className="decoration-circle decoration-circle-2" />
          <div className="decoration-circle decoration-circle-3" />
        </div>
      </div>
    </div>
  );
}
