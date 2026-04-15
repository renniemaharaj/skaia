import { type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticatedAtom, currentUserAtom } from "../../atoms/auth";
import { Unauthorized } from "../../pages/page/Unauthorized";

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
  const location = useLocation();

  // If not authenticated, redirect to login preserving the intended destination
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
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
