import type { ErrorInfo, ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("chunkloaderror") ||
    message.includes("loading chunk")
  );
}

interface AsyncErrorFallbackProps extends FallbackProps {
  label: string;
  onRetry?: () => void;
}

function AsyncErrorFallback({
  error,
  label,
  onRetry,
  resetErrorBoundary,
}: AsyncErrorFallbackProps) {
  const chunkFailure = isChunkLoadError(error);

  return (
    <div className="compact-form-card" role="alert">
      <strong>
        {chunkFailure ? `${label} could not be downloaded.` : `${label} could not load.`}
      </strong>
      <p>
        {chunkFailure
          ? "Check your connection, then try loading this part again."
          : "The rest of the page is still available. Try this part again."}
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          onRetry?.();
          resetErrorBoundary();
        }}
      >
        Retry
      </button>
    </div>
  );
}

interface AsyncBoundaryProps {
  children: ReactNode;
  label?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  onRetry?: () => void;
  resetKeys?: unknown[];
}

/** Keeps lazy/data-render failures local so sibling content and actions survive. */
export function AsyncBoundary({
  children,
  label = "Content",
  onError,
  onRetry,
  resetKeys,
}: AsyncBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={props => <AsyncErrorFallback {...props} label={label} onRetry={onRetry} />}
      onError={onError}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
