import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { ContentStandOutCard } from "../components/cards/ContentStandOutCard";
import "./ErrorPage.css";

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
    <div className="error-page">
      <ContentStandOutCard className="error-page-content">
        <div className="error-icon">
          <AlertCircle size={64} />
        </div>

        <div className="error-code">{errorCode}</div>

        <h1 className="error-title">{errorTitle}</h1>

        <p className="error-message">{errorMessage}</p>

        {details && <div className="error-details">{details}</div>}

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
      </ContentStandOutCard>
    </div>
  );
};

export default ErrorPage;
