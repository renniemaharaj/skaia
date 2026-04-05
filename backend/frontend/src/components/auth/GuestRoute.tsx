import { type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { Navigate } from "react-router-dom";
import { isAuthenticatedAtom, currentUserAtom } from "../../atoms/auth";

interface GuestRouteProps {
  children: ReactNode;
}

/**
 * Route wrapper that allows both authenticated and unauthenticated (guest)
 * users. Authenticated users who are suspended or banned are redirected away.
 */
export const GuestRoute: React.FC<GuestRouteProps> = ({ children }) => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);

  // Banned or suspended authenticated users can only access the root route
  if (
    isAuthenticated &&
    (currentUser?.is_suspended || (currentUser?.roles ?? []).includes("banned"))
  ) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
