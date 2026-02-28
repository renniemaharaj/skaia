import React from "react";
import ErrorPage from "./ErrorPage";

interface UnauthorizedPageProps {
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

/**
 * 403 Unauthorized/Forbidden page
 * Shown when users try to access restricted content
 */
const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({
  showBackButton = true,
  showHomeButton = true,
}) => {
  return (
    <ErrorPage
      errorCode={403}
      errorTitle="Access Denied"
      errorMessage="You don't have permission to access this resource."
      details="If you believe this is a mistake, please contact support or try logging in."
      showBackButton={showBackButton}
      showHomeButton={showHomeButton}
    />
  );
};

export default UnauthorizedPage;
