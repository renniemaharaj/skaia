import React from "react";
import { useAtomValue } from "jotai";
import { brandingAtom } from "../atoms/config";
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
  const branding = useAtomValue(brandingAtom);
  const logoUrl = branding?.logo_url || "/logo.png";

  return (
    <div className="loading-page">
      <div className="loading-page-content">
        <div className="loading-logo-wrapper">
          <img src={logoUrl} alt="App Logo" className="loading-logo" />
        </div>

        <h2 className="loading-title">{message}</h2>
        {subMessage && <p className="loading-subtitle">{subMessage}</p>}
      </div>
    </div>
  );
};

export default LoadingPage;
