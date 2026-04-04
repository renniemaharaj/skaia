import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSetAtom } from "jotai";
import {
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader,
  CheckCircle,
} from "lucide-react";
import {
  currentUserAtom,
  accessTokenAtom,
  refreshTokenAtom,
} from "../../atoms/auth";
import { loginUser, registerUser, type AuthResponse } from "../../utils/api";
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate form
      if (!isLogin && formData.password !== formData.passwordConfirm) {
        throw new Error("Passwords do not match");
      }

      let data: AuthResponse;
      if (isLogin) {
        data = await loginUser(formData.email, formData.password);

        // Store tokens in atoms (atomWithStorage handles localStorage automatically)
        setAccessToken(data.access_token);
        if (data.refresh_token) {
          setRefreshToken(data.refresh_token);
        }
        setCurrentUser(data.user);

        // Call success callback
        if (onAuthSuccess) {
          onAuthSuccess(data.access_token);
        }

        // Redirect to previous page or home (but not to /register)
        const from = (location.state as any)?.from?.pathname;
        const redirectTo = from && from !== "/register" ? from : "/";
        navigate(redirectTo);
      } else {
        // Registration
        data = await registerUser(
          formData.username,
          formData.email,
          formData.password,
        );

        // Show success message and redirect to login
        setError(null);
        setFormData({
          username: "",
          email: "",
          password: "",
          passwordConfirm: "",
        });

        // Redirect to login page with success message
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
