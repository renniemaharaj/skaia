import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, AlertCircle, Loader } from "lucide-react";
import { verifyEmail } from "../../utils/api";
import "../../components/auth/Auth.css";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus("success");
        setMessage("Your email has been verified!");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: "center" }}>
          {status === "loading" && (
            <>
              <Loader
                size={40}
                className="spinning"
                style={{ color: "var(--primary-color)", marginBottom: 16 }}
              />
              <h2 style={{ margin: 0 }}>Verifying your email...</h2>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle
                size={40}
                style={{ color: "var(--success-color)", marginBottom: 16 }}
              />
              <h2 style={{ margin: "0 0 12px" }}>{message}</h2>
              <p style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}>
                You can now use all features of your account.
              </p>
              <Link
                to="/login"
                className="auth-button"
                style={{ textDecoration: "none", display: "inline-flex" }}
              >
                Go to Login
              </Link>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle
                size={40}
                style={{ color: "var(--error-color)", marginBottom: 16 }}
              />
              <h2 style={{ margin: "0 0 12px" }}>Verification Failed</h2>
              <p style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}>
                {message}
              </p>
              <Link
                to="/login"
                className="auth-button"
                style={{ textDecoration: "none", display: "inline-flex" }}
              >
                Go to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
