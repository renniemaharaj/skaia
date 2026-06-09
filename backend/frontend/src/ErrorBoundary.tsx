import type { ErrorInfo, ReactNode } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary as ErrorBoundaryLib } from "react-error-boundary";
import ErrorPage from "./pages/ErrorPage";

/**
 * Error fallback component that displays error details
 */
const ErrorFallback = ({ error }: FallbackProps) => {
  return (
    <ErrorPage
      errorCode={500}
      errorTitle="Application Error"
      errorMessage="Something unexpected happened."
      details={error.message}
      showBackButton={false}
      showHomeButton={true}
    />
  );
};

interface Props {
  children: ReactNode;
}

/**
 * Error boundary wrapper that catches errors in the app
 * and displays a user-friendly error page using react-error-boundary
 */
export default function ErrorBoundary({ children }: Props) {
  const handleError = (error: Error, info: ErrorInfo) => {
    // Log error details for debugging
    console.error("ErrorBoundary caught an error:", error, info);
  };

  return (
    <ErrorBoundaryLib
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={() => {
        window.location.href = "/";
      }}
    >
      {children}
    </ErrorBoundaryLib>
  );
}
