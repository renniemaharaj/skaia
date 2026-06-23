import type React from "react";
import "./LoadingPage.css";
import { ContentStandOutCard } from "../components/cards/ContentStandOutCard";

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
    <div className="modal loading-page">
      <ContentStandOutCard style={{ paddingTop: "1.3rem" }} className="loading-page-content">
        <div className="loading-squares">
          <div className="loading-square sq1" />
          <div className="loading-square sq2" />
          <div className="loading-square sq3" />
        </div>
        <h2 className="loading-title">{message}</h2>
        {subMessage && <p className="loading-subtitle">{subMessage}</p>}
      </ContentStandOutCard>
    </div>
  );
};

export default LoadingPage;
