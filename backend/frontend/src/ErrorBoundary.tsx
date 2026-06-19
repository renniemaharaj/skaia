import type { ErrorInfo, ReactNode } from "react";
import { useEffect } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary as ErrorBoundaryLib } from "react-error-boundary";
import ErrorPage from "./pages/ErrorPage";

/**
 * Error fallback component that displays error details
 */
const ErrorFallback = ({ error }: FallbackProps) => {
  const isNetworkOrChunkError =
    error?.message?.includes("Failed to fetch dynamically imported module") ||
    error?.message?.includes("dynamically imported module") ||
    error?.message?.includes("Importing a module script failed") ||
    error?.message?.includes("Load failed") ||
    error?.message?.includes("NetworkError") ||
    error?.message?.includes("network");

  useEffect(() => {
    if (isNetworkOrChunkError) {
      const pingServer = () => {
        const wsUrl = window.location.protocol === "https:" 
          ? `wss://${window.location.host}/ws` 
          : `ws://${window.location.host}/ws`;
          
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          // Backend is back online!
          ws.close();
          window.location.reload();
        };
        
        ws.onerror = () => {
          // Still down, close and let the interval try again
          ws.close();
        };
      };

      pingServer(); // Try immediately
      const interval = setInterval(pingServer, 2000);
      return () => clearInterval(interval);
    }
  }, [isNetworkOrChunkError]);

  if (isNetworkOrChunkError) {
    return (
      <ErrorPage
        errorCode={503}
        errorTitle="Updating System..."
        errorMessage="The application is currently restarting. This page will automatically refresh as soon as it's ready."
        showBackButton={false}
        showHomeButton={false}
      />
    );
  }

  return (
    <ErrorPage
      errorCode={500}
      errorTitle="Application Error"
      errorMessage="Something unexpected happened."
      details={error?.message}
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
