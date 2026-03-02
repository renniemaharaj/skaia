import { type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { Navigate } from "react-router-dom";
import { isAuthenticatedAtom, currentUserAtom } from "../atoms/auth";
import { Unauthorized } from "../page/Unauthorized";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRole,
}) => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);

  // If not authenticated, show unauthorized page
  if (!isAuthenticated) {
    return <Unauthorized />;
  }

  // Banned or suspended users can only access the root route
  if (
    currentUser?.is_suspended ||
    (currentUser?.roles ?? []).includes("banned")
  ) {
    return <Navigate to="/" replace />;
  }

  // Check role-based access if required
  if (requiredRole && !(currentUser?.roles ?? []).includes(requiredRole)) {
    return <Unauthorized />;
  }

  // Check permission-based access if required
  if (requiredPermission && currentUser) {
    const hasPermission = currentUser.permissions?.includes(requiredPermission);
    if (!hasPermission) {
      return <Unauthorized />;
    }
  }

  return <>{children}</>;
};
