/**
 * API service for centralized HTTP requests with authentication
 */

import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import { type User } from "../atoms/auth";
import { apiBaseUrlAtom } from "../atoms/config";

const API_BASE_URL = getDefaultStore().get(apiBaseUrlAtom); // should be "" or "/" for same-origin

export interface ApiError {
  error: string;
  message?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user: User;
  expires_in?: number;
}

/**
 * Get authorization headers with token
 */
function getAuthHeaders(includeContentType = true): Record<string, string> {
  const token = localStorage.getItem("auth.accessToken");

  if (token) {
    console.debug(
      "Auth token found in localStorage (first 20 chars):",
      token.substring(0, 20) + "...",
    );
  } else {
    console.warn("No auth token found in localStorage");
  }
  return {
    ...(includeContentType && { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function mergeHeaders(base: HeadersInit, extra?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (!extra) {
    return headers;
  }

  const extraHeaders = new Headers(extra);
  extraHeaders.forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
}

/**
 * Make authenticated API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const isFormData = options.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: mergeHeaders(getAuthHeaders(!isFormData), options.headers),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let retryAfter: number | undefined;
    let errorData: ApiError | null = null;
    try {
      errorData = await response.json();
      errorMessage = errorData?.error || errorData?.message || errorMessage;
    } catch {
      // Use default error message
    }

    const retryHeader = response.headers.get("Retry-After");
    if (retryHeader) {
      const retry = parseInt(retryHeader, 10);
      if (!Number.isNaN(retry)) {
        retryAfter = retry;
      }
    }

    if (response.status === 429) {
      toast.error(
        `${errorMessage}${retryAfter ? ` — retry after ${retryAfter}s` : ""}`,
      );
    }

    // Handle 503 — site may be armed (maintenance mode)
    if (
      response.status === 503 &&
      errorMessage.toLowerCase().includes("armed")
    ) {
      window.dispatchEvent(new CustomEvent("site:armed"));
      throw new Error(errorMessage);
    }

    // Handle 401 Unauthorized — attempt a token refresh before logging out
    if (response.status === 401) {
      const refreshToken = localStorage.getItem("auth.refreshToken");

      if (refreshToken && !endpoint.includes("/auth/refresh")) {
        try {
          const refreshResp = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshResp.ok) {
            const data: AuthResponse = await refreshResp.json();
            localStorage.setItem("auth.accessToken", data.access_token);
            if (data.refresh_token) {
              localStorage.setItem("auth.refreshToken", data.refresh_token);
            }
            if (data.user) {
              localStorage.setItem("auth.user", JSON.stringify(data.user));
            }

            // Retry the original request with the new token
            const retryResp = await fetch(url, {
              ...options,
              headers: mergeHeaders(
                getAuthHeaders(!isFormData),
                options.headers,
              ),
            });
            if (retryResp.ok) {
              try {
                return await retryResp.json();
              } catch {
                return null as T;
              }
            }
            // Retry also failed — fall through to clear auth
          }
        } catch {
          // Refresh request failed — fall through to clear auth
        }
      }

      // Clear auth tokens from localStorage
      localStorage.removeItem("auth.accessToken");
      localStorage.removeItem("auth.refreshToken");
      localStorage.removeItem("auth.user");
      localStorage.removeItem("auth.isAuthenticated");

      // Dispatch custom event that the app can listen to
      window.dispatchEvent(
        new CustomEvent("auth:unauthorized", { detail: { errorMessage } }),
      );
    }

    const err = new Error(errorMessage) as Error & {
      status?: number;
      retryAfter?: number;
      details?: ApiError | null;
    };
    err.status = response.status;
    if (retryAfter !== undefined) err.retryAfter = retryAfter;
    err.details = errorData;
    throw err;
  }

  try {
    return await response.json();
  } catch {
    // Return null for empty responses
    return null as T;
  }
}

/**
 * Login user
 */
export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Register user
 */
export async function registerUser(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      email,
      password,
      display_name: username,
    }),
  });
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

/**
 * Get current user profile
 */
export async function getCurrentUser() {
  return apiRequest("/users/profile", {
    method: "GET",
  });
}

/**
 * Upload file
 */
export async function uploadFile(
  file: File,
  endpoint: string,
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const token = localStorage.getItem("auth.accessToken");
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    body: formData,
    headers: mergeHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  if (!response.ok) {
    throw new Error("File upload failed");
  }

  return response.json();
}
