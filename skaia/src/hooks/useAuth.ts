import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  accessTokenAtom,
  refreshTokenAtom,
  currentUserAtom,
  isAuthenticatedAtom,
  authLoadingAtom,
  authErrorAtom,
  hasPermissionAtom,
  hasRoleAtom,
  type User,
  //   type AuthState,
  authStateAtom,
} from "../atoms/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  display_name: string;
}

/**
 * Hook for reading authentication state
 */
export const useAuthState = () => {
  return useAtomValue(authStateAtom);
};

/**
 * Hook for authentication operations
 */
export const useAuth = () => {
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const setIsAuthenticated = useSetAtom(isAuthenticatedAtom);
  const setAuthLoading = useSetAtom(authLoadingAtom);
  const setAuthError = useSetAtom(authErrorAtom);

  const setAuthState = (
    user: User,
    accessToken: string,
    refreshToken: string,
  ) => {
    setCurrentUser(user);
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    setIsAuthenticated(true);
  };

  const clearAuthState = () => {
    setCurrentUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
  };

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Login failed");
        }

        const data = await response.json();
        setAuthState(data.user, data.access_token, data.refresh_token);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Login failed";
        setAuthError(errorMessage);
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [
      setAccessToken,
      setRefreshToken,
      setCurrentUser,
      setIsAuthenticated,
      setAuthLoading,
      setAuthError,
    ],
  );

  const register = useCallback(
    async (credentials: RegisterCredentials) => {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Registration failed");
        }

        const data = await response.json();
        setAuthState(data.user, data.access_token, data.refresh_token);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Registration failed";
        setAuthError(errorMessage);
        throw err;
      } finally {
        setAuthLoading(false);
      }
    },
    [
      setAccessToken,
      setRefreshToken,
      setCurrentUser,
      setIsAuthenticated,
      setAuthLoading,
      setAuthError,
    ],
  );

  const logout = useCallback(() => {
    clearAuthState();
  }, [setCurrentUser, setAccessToken, setRefreshToken, setIsAuthenticated]);

  const refreshAccessToken = useCallback(
    async (refreshToken: string) => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          throw new Error("Token refresh failed");
        }

        const data = await response.json();
        setAccessToken(data.access_token);
        return data.access_token;
      } catch (err) {
        clearAuthState();
        throw err;
      }
    },
    [setAccessToken, setCurrentUser, setRefreshToken, setIsAuthenticated],
  );

  return {
    login,
    register,
    logout,
    refreshAccessToken,
  };
};

/**
 * Hook for checking permissions
 */
export const usePermission = (permission: string) => {
  const hasPermission = useAtomValue(hasPermissionAtom);
  return hasPermission(permission);
};

/**
 * Hook for checking roles
 */
export const useRole = (role: string) => {
  const hasRole = useAtomValue(hasRoleAtom);
  return hasRole(role);
};

/**
 * Hook for getting current user
 */
export const useCurrentUser = () => {
  return useAtomValue(currentUserAtom);
};

/**
 * Hook to check if user is authenticated
 */
export const useIsAuthenticated = () => {
  return useAtomValue(isAuthenticatedAtom);
};

/**
 * Hook for getting auth tokens
 */
export const useAuthTokens = () => {
  const accessToken = useAtomValue(accessTokenAtom);
  const refreshToken = useAtomValue(refreshTokenAtom);

  return { accessToken, refreshToken };
};

/**
 * Custom hook for making authenticated requests
 */
export const useAuthenticatedFetch = () => {
  const { accessToken } = useAuthTokens();
  const { refreshAccessToken } = useAuth();
  const { refreshToken } = useAuthTokens();

  return useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      };

      let response = await fetch(url, { ...options, headers });

      // If 401, try to refresh token and retry
      if (response.status === 401 && refreshToken) {
        try {
          const newAccessToken = await refreshAccessToken(refreshToken);
          const newHeaders = {
            ...options.headers,
            Authorization: `Bearer ${newAccessToken}`,
          };
          response = await fetch(url, { ...options, headers: newHeaders });
        } catch (err) {
          // Refresh failed, authentication lost
          throw err;
        }
      }

      return response;
    },
    [accessToken, refreshToken, refreshAccessToken],
  );
};
