import React from "react";
import ErrorPage from "./ErrorPage";

interface NotFoundPageProps {
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

/**
 * 404 Not Found page
 * Extends the generic ErrorPage for 404-specific error handling
 */
const NotFoundPage: React.FC<NotFoundPageProps> = ({
  showBackButton = true,
  showHomeButton = true,
}) => {
  return (
    <ErrorPage
      errorCode={404}
      errorTitle="Page Not Found"
      errorMessage="The page you're looking for doesn't exist or has been moved."
      details="This could happen if the link is broken or the page has been removed."
      showBackButton={showBackButton}
      showHomeButton={showHomeButton}
    />
  );
};

export default NotFoundPage;
