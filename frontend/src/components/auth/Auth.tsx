import { useSetAtom } from "jotai";
import { CheckCircle, Lock, Mail, User } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormikHelpers } from "formik";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { accessTokenAtom, currentUserAtom, refreshTokenAtom } from "../../atoms/auth";
import { type AuthResponse, loginUser, registerUser } from "../../utils/api";
import "../ui/FormGroup.css";
import "./Auth.css";
import MFAChallenge from "../../pages/MFAChallenge";
import { FormField, ManagedForm } from "../form";
import Button from "../ui/Button";

interface AuthPageProps {
  onAuthSuccess?: (token: string) => void;
  initialMode?: "login" | "register";
}

export const Auth: React.FC<AuthPageProps> = ({ onAuthSuccess, initialMode = "login" }) => {
  const [isLogin, setIsLogin] = useState(initialMode === "login");
  const [success, setSuccess] = useState<string | null>(null);
  const [initialEmail, setInitialEmail] = useState("");

  // TOTP challenge state
  const [totpToken, setTotpToken] = useState<string | null>(null);

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
        setInitialEmail(state.email);
      }
      // Clear the state so it doesn't persist on navigation
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

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
    const redirectTo = from && from !== "/register" && !from.startsWith("/tmp/") ? from : "/";
    navigate(redirectTo);
  };

  const handleSubmit = async (
    values: { username: string; email: string; password: string; passwordConfirm: string },
    helpers: FormikHelpers<{
      username: string;
      email: string;
      password: string;
      passwordConfirm: string;
    }>
  ) => {
    helpers.setStatus(undefined);
    try {
      let data: AuthResponse;
      if (isLogin) {
        data = await loginUser(values.email, values.password);

        // 2FA required - show TOTP challenge
        if (data.requires_totp && data.totp_token) {
          setTotpToken(data.totp_token);
          return;
        }

        completeLogin(data);
      } else {
        data = await registerUser(values.username, values.email, values.password);

        helpers.resetForm();

        navigate("/login", {
          state: {
            message: "Account created successfully! Please log in.",
            email: values.email,
          },
        });
      }
    } catch (err) {
      helpers.setStatus(err instanceof Error ? err.message : "An error occurred");
    }
  };

  // TOTP challenge screen
  if (totpToken) {
    return (
      <MFAChallenge
        totpToken={totpToken}
        onBack={() => setTotpToken(null)}
        onAuthSuccess={(_, data) => {
          if (data) {
            completeLogin(data);
          }
        }}
      />
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <ManagedForm
          id="auth-form"
          className="auth-card"
          formClassName="auth-form"
          variant="grouped"
          icon={<Lock size={18} />}
          title={isLogin ? "Welcome Back" : "Join Us"}
          description={
            isLogin ? "Log in to your account to continue" : "Create a new account to get started"
          }
          initialValues={{ username: "", email: initialEmail, password: "", passwordConfirm: "" }}
          enableReinitialize
          validate={values => {
            const errors: Partial<typeof values> = {};
            if (!values.email.trim()) errors.email = "Email is required";
            if (!values.password) errors.password = "Password is required";
            if (!isLogin && !values.username.trim()) errors.username = "Username is required";
            if (!isLogin && values.password !== values.passwordConfirm) {
              errors.passwordConfirm = "Passwords do not match";
            }
            return errors;
          }}
          onSubmit={handleSubmit}
          submitLabel={isLogin ? "Log In" : "Create Account"}
          submittingLabel={isLogin ? "Logging in..." : "Creating account..."}
          afterActions={formik => (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <div className="auth-toggle">
                <p>
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                  <Button unstyled
                    type="button"
                    className="auth-toggle-btn"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setSuccess(null);
                      setInitialEmail("");
                      formik.resetForm();
                    }}
                    disabled={formik.isSubmitting}
                  >
                    {isLogin ? "Sign up" : "Log in"}
                  </Button>
                </p>
              </div>
            </>
          )}
        >
          {formik => (
            <>
              {success && (
                <div className="auth-success">
                  <CheckCircle size={20} />
                  <span>{success}</span>
                </div>
              )}

              {!isLogin && (
                <FormField
                  name="username"
                  label="Username"
                  help="This is how other members will identify you."
                  icon={<User size={20} />}
                  variant="grouped"
                  placeholder="Choose a username"
                  required
                  disabled={formik.isSubmitting}
                />
              )}
              <FormField
                name="email"
                label="Account email"
                type="email"
                icon={<Mail size={20} />}
                variant="grouped"
                placeholder="Enter your email address"
                required
                disabled={formik.isSubmitting}
              />
              <FormField
                name="password"
                label="Password"
                type="password"
                help={!isLogin ? "Use a unique password you do not use elsewhere." : undefined}
                icon={<Lock size={20} />}
                variant="grouped"
                placeholder="Enter your password"
                required
                disabled={formik.isSubmitting}
              />
              {!isLogin && (
                <FormField
                  name="passwordConfirm"
                  label="Confirm Password"
                  type="password"
                  help="Enter the same password again."
                  icon={<Lock size={20} />}
                  variant="grouped"
                  placeholder="Confirm your password"
                  required
                  disabled={formik.isSubmitting}
                />
              )}
              {isLogin && (
                <div className="auth-forgot">
                  <Link to="/forgot-password">Forgot your password?</Link>
                </div>
              )}
            </>
          )}
        </ManagedForm>

        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1" />
          <div className="decoration-circle decoration-circle-2" />
          {/* <div className="decoration-circle decoration-circle-3" /> */}
        </div>
      </div>
    </div>
  );
};
