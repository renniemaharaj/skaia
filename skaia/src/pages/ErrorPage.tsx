import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";
import "./ErrorPage.css";

interface ErrorPageProps {
  errorCode?: number;
  errorTitle?: string;
  errorMessage?: string;
  details?: string;
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
      <div className="error-page-content">
        <div className="error-icon">
          <AlertCircle size={64} />
        </div>

        <div className="error-code">{errorCode}</div>

        <h1 className="error-title">{errorTitle}</h1>

        <p className="error-message">{errorMessage}</p>

        {details && <p className="error-details">{details}</p>}

        <div className="error-actions">
          {showBackButton && (
            <button
              className="error-btn error-btn--secondary"
              onClick={handleBack}
            >
              <ArrowLeft size={16} />
              Go Back
            </button>
          )}
          {showHomeButton && (
            <button
              className="error-btn error-btn--primary"
              onClick={handleHome}
            >
              <Home size={16} />
              Return Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
