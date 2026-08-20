import { AlertCircle, ArrowLeft, Home, ServerCog } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { ContentFlatCard } from "../components/cards/ContentFlatCard";
import { FormSectionIntro } from "../components/form";
import "../components/auth/Auth.css";

interface ErrorPageProps {
  errorCode?: number;
  errorTitle?: string;
  errorMessage?: React.ReactNode;
  details?: React.ReactNode;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

/**
 * Professional error page component for displaying errors
 * Consistent with site UI and provides helpful navigation
 */
const ErrorPage: React.FC<ErrorPageProps> = ({
  errorCode = 500,
  errorTitle = "Oops! Something went wrong",
  errorMessage = "An error occurred while processing your request.",
  details,
  showBackButton = true,
  showHomeButton = true,
}) => {
  const navigate = useNavigate();

  const handleBack = () => navigate(-1);
  const handleHome = () => navigate("/");

  return (
    <div className="auth-page">
      <div className="auth-container">
        <ContentFlatCard className="auth-card auth-card--challenge">
          <FormSectionIntro
            className="managed-form__section-intro--spaced"
            icon={
              errorCode === 503 ? (
                <ServerCog size={20} className="animate-pulse" aria-hidden="true" />
              ) : (
                <AlertCircle size={20} aria-hidden="true" />
              )
            }
            eyebrow={`Error ${errorCode}`}
            title={errorTitle}
            description={errorMessage}
            headingLevel={1}
          />

          <div className="section__content">
            {details}

            <div className="ui-actions ui-actions--center ui-actions--stack-sm">
              {showBackButton && (
                <button type="button" className="btn btn-ghost" onClick={handleBack}>
                  <ArrowLeft size={16} />
                  Go Back
                </button>
              )}
              {showHomeButton && (
                <button type="button" className="btn btn-primary" onClick={handleHome}>
                  <Home size={16} />
                  Return Home
                </button>
              )}
            </div>
          </div>
        </ContentFlatCard>
      </div>
    </div>
  );
};

export default ErrorPage;
