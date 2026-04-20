import React from "react";
import ErrorPage from "./ErrorPage";

interface RateLimitedPageProps {
  retrySeconds?: number;
}

const RateLimitedPage: React.FC<RateLimitedPageProps> = ({ retrySeconds }) => {
  return (
    <ErrorPage
      errorCode={429}
      errorTitle="Rate limit exceeded"
      errorMessage="The application has reached its request limit and is temporarily blocked."
      details={
        retrySeconds
          ? `Please wait ${retrySeconds} second${
              retrySeconds === 1 ? "" : "s"
            } before trying again.`
          : "Please wait while the rate-limit window clears."
      }
      showBackButton={false}
      showHomeButton={false}
    />
  );
};

export default RateLimitedPage;
