import React from "react";
import ErrorPage from "./ErrorPage";

interface ServerErrorPageProps {
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

/**
 * 500 Internal Server Error page
 * Shown when the server encounters an error
 */
const ServerErrorPage: React.FC<ServerErrorPageProps> = ({
  showBackButton = true,
  showHomeButton = true,
}) => {
  return (
    <ErrorPage
      errorCode={500}
      errorTitle="Server Error"
      errorMessage="Something went wrong on our end."
      details="Our team has been notified. Please try again later or contact support if the problem persists."
      showBackButton={showBackButton}
      showHomeButton={showHomeButton}
    />
  );
};

export default ServerErrorPage;
