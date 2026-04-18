import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useSetAtom } from "jotai";
import {
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader,
  CheckCircle,
  ShieldCheck,
} from "lucide-react";
import {
  currentUserAtom,
  accessTokenAtom,
  refreshTokenAtom,
} from "../../atoms/auth";
import {
  loginUser,
  loginTOTP,
  registerUser,
  type AuthResponse,
} from "../../utils/api";
import "./Auth.css";
import "../ui/FormGroup.css";

interface AuthPageProps {
  onAuthSuccess?: (token: string) => void;
  initialMode?: "login" | "register";
}

export const Auth: React.FC<AuthPageProps> = ({
  onAuthSuccess,
  initialMode = "login",
}) => {
  const [isLogin, setIsLogin] = useState(initialMode === "login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });

  // TOTP challenge state
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const setCurrentUser = useSetAtom(currentUserAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);

  const navigate = useNavigate();
  const location = useLocation();

  // Handle navigation state (e.g., success message from registration redirect)
  useEffect(() => {
    const state = location.state as any;
    if (state?.message) {
      setSuccess(state.message);
      // Pre-fill email if provided
      if (state?.email) {
        setFormData((prev) => ({
          ...prev,
          email: state.email,
        }));
      }
      // Clear the state so it doesn't persist on navigation
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const completeLogin = (data: AuthResponse) => {
    setAccessToken(data.access_token);
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token);
    }
    setCurrentUser(data.user);
    if (onAuthSuccess) {
      onAuthSuccess(data.access_token);
    }
    const from = (location.state as any)?.from?.pathname;
    const redirectTo =
      from && from !== "/register" && !from.startsWith("/tmp/") ? from : "/";
    navigate(redirectTo);
  };

  const handleTOTPSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await loginTOTP(
        totpToken!,
        useBackupCode ? undefined : totpCode,
        useBackupCode ? totpCode : undefined,
      );
      completeLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isLogin && formData.password !== formData.passwordConfirm) {
        throw new Error("Passwords do not match");
      }

      let data: AuthResponse;
      if (isLogin) {
        data = await loginUser(formData.email, formData.password);

        // 2FA required — show TOTP challenge
        if (data.requires_totp && data.totp_token) {
          setTotpToken(data.totp_token);
          setTotpCode("");
          setLoading(false);
          return;
        }

        completeLogin(data);
      } else {
        data = await registerUser(
          formData.username,
          formData.email,
          formData.password,
        );

        setError(null);
        setFormData({
          username: "",
          email: "",
          password: "",
          passwordConfirm: "",
        });

        navigate("/login", {
          state: {
            message: "Account created successfully! Please log in.",
            email: formData.email,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // ── TOTP challenge screen ──────────────────────────────────────────────
  if (totpToken) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <ShieldCheck
                size={40}
                style={{ color: "var(--primary-color)", marginBottom: 8 }}
              />
              <h1>Two-Factor Authentication</h1>
              <p>
                {useBackupCode
                  ? "Enter one of your backup codes"
                  : "Enter the 6-digit code from your authenticator app"}
              </p>
            </div>

            {error && (
              <div className="auth-error">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleTOTPSubmit} className="auth-form">
              <div className="form-group">
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
                    autoFocus
                  />
                </div>
              </div>

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? (
                  <>
                    <Loader size={20} className="spinning" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </button>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

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
              <p style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="auth-toggle-btn"
                  onClick={() => {
                    setTotpToken(null);
                    setTotpCode("");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Back to login
                </button>
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

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>{isLogin ? "Welcome Back" : "Join Us"}</h1>
            <p>
              {isLogin
                ? "Log in to your account to continue"
                : "Create a new account to get started"}
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="auth-success">
              <CheckCircle size={20} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {!isLogin && (
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <div className="input-wrapper">
                  <User size={20} className="input-icon" />
                  <input
                    id="username"
                    type="text"
                    name="username"
                    placeholder="Choose a username"
                    value={formData.username}
                    onChange={handleChange}
                    required={!isLogin}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <Mail size={20} className="input-icon" />
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <Lock size={20} className="input-icon" />
                <input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="passwordConfirm">Confirm Password</label>
                <div className="input-wrapper">
                  <Lock size={20} className="input-icon" />
                  <input
                    id="passwordConfirm"
                    type="password"
                    name="passwordConfirm"
                    placeholder="Confirm your password"
                    value={formData.passwordConfirm}
                    onChange={handleChange}
                    required={!isLogin}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {isLogin && (
              <div className="auth-forgot">
                <Link to="/forgot-password">Forgot your password?</Link>
              </div>
            )}

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? (
                <>
                  <Loader size={20} className="spinning" />
                  {isLogin ? "Logging in..." : "Creating account..."}
                </>
              ) : isLogin ? (
                "Log In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-toggle">
            <p>
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <button
                type="button"
                className="auth-toggle-btn"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                  setSuccess(null);
                  setFormData({
                    username: "",
                    email: "",
                    password: "",
                    passwordConfirm: "",
                  });
                }}
                disabled={loading}
              >
                {isLogin ? "Sign up" : "Log in"}
              </button>
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
};
