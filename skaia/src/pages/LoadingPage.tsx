import React from "react";
import "./LoadingPage.css";

interface LoadingPageProps {
  message?: string;
  subMessage?: string;
}

/**
 * Professional loading page component
 * Shows while content is being fetched
 */
const LoadingPage: React.FC<LoadingPageProps> = ({
  message = "Loading...",
  subMessage = "Please wait while we prepare your content",
}) => {
  return (
    <div className="loading-page">
      <div className="loading-page-content">
        <div className="loading-spinner">
          <div className="spinner-circle"></div>
        </div>

        <h2 className="loading-title">{message}</h2>

        {subMessage && <p className="loading-subtitle">{subMessage}</p>}
      </div>
    </div>
  );
};

export default LoadingPage;
