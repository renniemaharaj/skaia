import { CheckCircle, Lock } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { FormikHelpers } from "formik";
import { resetPassword } from "../../utils/api";
import { ContentStandOutCard } from "../cards/ContentStandOutCard";
import { FormField, ManagedForm } from "../form";
import Button from "../ui/Button";
import "./Auth.css";
import "../ui/FormGroup.css";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();

  const [done, setDone] = useState(false);

  const handleSubmit = async (
    values: { password: string; confirm: string },
    helpers: FormikHelpers<{ password: string; confirm: string }>
  ) => {
    helpers.setStatus(undefined);
    if (!token) {
      helpers.setStatus("Missing reset token.");
      return;
    }

    try {
      await resetPassword(token, values.password);
      setDone(true);
    } catch (err) {
      helpers.setStatus(err instanceof Error ? err.message : "Failed to reset password");
    }
  };

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <ContentStandOutCard className="auth-card" style={{ textAlign: "center" }}>
            <div className="section__content">
              <CheckCircle size={40} style={{ color: "var(--success-color)", marginBottom: 16 }} />
              <h2 style={{ margin: "0 0 12px" }}>Password Reset</h2>
              <p style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}>
                Your password has been changed. You can now log in with your new password.
              </p>
              <div className="form-actions" style={{ justifyContent: "center" }}>
                <Button unstyled
                  type="button"
                  className="auth-button"
                  onClick={() => navigate("/login")}
                  style={{ display: "inline-flex" }}
                >
                  Go to Login
                </Button>
              </div>
            </div>
          </ContentStandOutCard>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <ManagedForm
          id="reset-password-form"
          className="auth-card"
          formClassName="auth-form"
          variant="grouped"
          icon={<Lock size={18} />}
          title="Set New Password"
          description="Enter your new password below"
          initialValues={{ password: "", confirm: "" }}
          validate={values => {
            const errors: Partial<typeof values> = {};
            if (values.password.length < 8)
              errors.password = "Password must be at least 8 characters";
            if (values.password !== values.confirm) errors.confirm = "Passwords do not match";
            return errors;
          }}
          onSubmit={handleSubmit}
          submitLabel="Reset Password"
          afterActions={
            <>
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
            </>
          }
        >
          {formik => (
            <>
              <FormField
                name="password"
                label="New Password"
                type="password"
                help="Choose a unique password you do not use elsewhere."
                icon={<Lock size={20} />}
                variant="grouped"
                placeholder="Enter new password"
                disabled={formik.isSubmitting}
              />
              <FormField
                name="confirm"
                label="Confirm Password"
                type="password"
                help="Enter the new password again."
                icon={<Lock size={20} />}
                variant="grouped"
                placeholder="Confirm new password"
                disabled={formik.isSubmitting}
              />
            </>
          )}
        </ManagedForm>

        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1" />
          <div className="decoration-circle decoration-circle-2" />
          <div className="decoration-circle decoration-circle-3" />
        </div>
      </div>
    </div>
  );
}
