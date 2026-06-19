import { AlertCircle, CheckCircle, Loader } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../../utils/api";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import "./Auth.css";

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
				<ContentFlatCard className="auth-card" style={{ textAlign: "center" }}>
          <div className="section__content">
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
								<p
									style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}
								>
                  You can now use all features of your account.
                </p>
								<div
									className="form-actions"
									style={{ justifyContent: "center" }}
								>
                  <Link
                    to="/login"
                    className="auth-button"
                    style={{ textDecoration: "none", display: "inline-flex" }}
                  >
                    Go to Login
                  </Link>
                </div>
              </>
            )}
            {status === "error" && (
              <>
								<AlertCircle
									size={40}
									style={{ color: "var(--error-color)", marginBottom: 16 }}
								/>
                <h2 style={{ margin: "0 0 12px" }}>Verification Failed</h2>
								<p
									style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}
								>
									{message}
								</p>
								<div
									className="form-actions"
									style={{ justifyContent: "center" }}
								>
                  <Link
                    to="/login"
                    className="auth-button"
                    style={{ textDecoration: "none", display: "inline-flex" }}
                  >
                    Go to Login
                  </Link>
                </div>
              </>
            )}
          </div>
				</ContentFlatCard>
      </div>
    </div>
  );
}
