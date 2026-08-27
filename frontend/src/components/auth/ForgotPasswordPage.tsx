import type { FormikHelpers } from "formik";
import { CheckCircle, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../../utils/api";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { FormField, FormSectionIntro, ManagedForm } from "../form";
import "./Auth.css";
import "../ui/FormGroup.css";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const handleSubmit = async (
    values: { email: string },
    helpers: FormikHelpers<{ email: string }>
  ) => {
    helpers.setStatus(undefined);
    try {
      await forgotPassword(values.email);
      setSent(true);
    } catch (err) {
      helpers.setStatus(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        {sent ? (
          <ContentFlatCard className="auth-card">
            <FormSectionIntro
              icon={<ShieldCheck size={18} />}
              title="Check your email"
              description="Password reset instructions have been requested"
            />
            <div className="section__content auth-form">
              <div className="auth-success">
                <CheckCircle size={20} />
                <span>
                  If an account exists for that address, we sent a one-time password reset link.
                </span>
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
          </ContentFlatCard>
        ) : (
          <ManagedForm
            id="forgot-password-form"
            className="auth-card"
            formClassName="auth-form"
            variant="grouped"
            icon={<ShieldCheck size={18} />}
            title="Reset your password"
            description="Enter your account email and we’ll send a secure reset link"
            initialValues={{ email: "" }}
            validate={values => (!values.email.trim() ? { email: "Email is required" } : {})}
            onSubmit={handleSubmit}
            submitLabel="Send reset link"
            afterActions={
              <div className="auth-toggle">
                <p>
                  Remember your password?
                  <Link to="/login" className="auth-toggle-btn">
                    Log in
                  </Link>
                </p>
              </div>
            }
          >
            {formik => (
              <FormField
                name="email"
                label="Account email"
                type="email"
                help="Use the email associated with the account."
                icon={<Mail size={20} />}
                variant="grouped"
                placeholder="Enter your email address"
                disabled={formik.isSubmitting}
              />
            )}
          </ManagedForm>
        )}
        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1" />
          <div className="decoration-circle decoration-circle-2" />
        </div>
      </div>
    </div>
  );
}
