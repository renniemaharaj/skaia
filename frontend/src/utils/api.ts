import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import type { User } from "../atoms/auth";
import { apiBaseUrlAtom } from "../atoms/config";
import { createRequestBatcher } from "./requestBatcher";

const API_BASE_URL = getDefaultStore()?.get(apiBaseUrlAtom) ?? "/api"; // should be "" or "/" for same-origin
const API_READ_COALESCE_WINDOW_MS = 8;
const WS_API_REQUEST_TIMEOUT_MS = 15_000;
const WS_API_BRIDGE_ENABLED = import.meta.env.VITE_WS_API_BRIDGE_ENABLED === "true";

export interface RateLimitDefconInfo {
  ips_jailed?: number;
  distinct_ips_tracked?: number;
  citizens?: number;
  limiter_state?: number | string;
}

export interface ApiError {
  error: string;
  message?: string;
  challenge?: string;
  reason_code?: MFAChallengeReason | "account_provisional" | "action_rate_limited";
  action?: string;
  defcon_info?: RateLimitDefconInfo;
  retry_after?: number;
  unlock_at?: string;
  remaining_seconds?: number;
  totp_setup_route?: string;
}

export type MFAChallengeReason =
  | "authentication_required"
  | "ip_changed"
  | "suspicious_activity"
  | "sensitive_action"
  | "session_expired";

export interface MFAChallengeContext {
  reasonCode?: MFAChallengeReason;
  action?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface LazyApiRequestOptions<K, V, R> {
  buildBody: (keys: K[]) => unknown;
  selectItems: (response: R) => V[];
  keyOf: (item: V) => K;
  windowMs?: number;
  maxBatchSize?: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user: User;
  expires_in?: number;
  requires_totp?: boolean;
  totp_token?: string;
}

export interface ForgotPasswordResponse {
  status: string;
  message?: string;
}

// Admin TOTP (2FA) Management
export interface AdminTOTPEnableResponse {
  status: string;
  backup_codes: string[];
}

/**
 * Admin: Enable TOTP for another user
 */
export async function adminEnableTOTP(
  userId: string,
  secret: string,
  code: string
): Promise<AdminTOTPEnableResponse> {
  return apiRequest(`/auth/admin/totp/${userId}/enable`, {
    method: "POST",
    body: JSON.stringify({ secret, code }),
  });
}

/**
 * Admin: Disable TOTP for another user
 */
export async function adminDisableTOTP(userId: string): Promise<{ status: string }> {
  return apiRequest(`/auth/admin/totp/${userId}/disable`, {
    method: "POST",
  });
}

/**
 * Admin: Trigger MFA Challenge for another user
 */
export async function adminTriggerMFAChallenge(userId: string): Promise<{ status: string }> {
  return apiRequest(`/auth/admin/totp/${userId}/challenge`, {
    method: "POST",
  });
}

/**
 * Admin: Generate backup codes for another user
 */
export async function adminGenerateBackupCodes(
  userId: string
): Promise<{ backup_codes: string[] }> {
  return apiRequest(`/auth/admin/totp/${userId}/generate-backup-codes`, {
    method: "POST",
  });
}

/**
 * API service for centralized HTTP requests with authentication
 */
/**
 * Get authorization headers with token
 */
function getAuthHeaders(includeContentType = true): Record<string, string> {
  let token = localStorage.getItem("auth.accessToken");
  if (token?.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);

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

interface PendingAPIRead<T> {
  promise: Promise<T>;
  timer: ReturnType<typeof setTimeout>;
}

const pendingAPIReads = new Map<string, PendingAPIRead<unknown>>();

function normalizedMethod(options: RequestInit): string {
  return (options.method || "GET").toUpperCase();
}

function shouldCoalesceRead(options: RequestInit): boolean {
  const method = normalizedMethod(options);
  return (method === "GET" || method === "HEAD") && !options.body && !options.signal;
}

function headersKey(headers?: HeadersInit): string {
  if (!headers) return "";
  const normalized = new Headers(headers);
  const values: string[] = [];
  normalized.forEach((value, key) => {
    values.push(`${key}:${value}`);
  });
  return values.sort().join("|");
}

function requestCoalesceKey(endpoint: string, options: RequestInit): string {
  return [
    normalizedMethod(options),
    endpoint,
    headersKey(mergeHeaders(getAuthHeaders(false), options.headers)),
  ].join(" ");
}

import { getGlobalWs } from "../hooks/useWebSocketSync";
import { decodeApiResponse, encodeApiRequest, sendWebSocketMessage } from "./wsProtobuf";
import type { ApiRequestProto } from "./wsProtobuf";

interface PendingWsRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingWsRequests = new Map<number, PendingWsRequest<any>>();

function allocateWsRequestId(): number {
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] === 0 || pendingWsRequests.has(values[0]));
  return values[0];
}

export function rejectAllWsApiRequests(reason = "WebSocket disconnected") {
  for (const pending of pendingWsRequests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
  }
  pendingWsRequests.clear();
}

export function resolveWsApiResponse(rawPayload: Uint8Array): boolean {
  try {
    const response = decodeApiResponse(rawPayload);
    const reqId =
      typeof response.requestId === "number"
        ? response.requestId
        : Number((response.requestId as any).toString());

    const pending = pendingWsRequests.get(reqId);
    if (!pending) return false;
    pendingWsRequests.delete(reqId);
    clearTimeout(pending.timer);

    if (response.status >= 400) {
      let errorData;
      let errorMessage = `HTTP ${response.status}`;
      try {
        const text = new TextDecoder().decode(response.body);
        errorData = JSON.parse(text);
        errorMessage = errorData?.error || errorData?.message || errorMessage;
      } catch {}
      const err = new Error(errorMessage) as any;
      err.status = response.status;
      err.details = errorData;
      const retryAfter = response.headers?.["Retry-After"] ?? response.headers?.["retry-after"];
      if (retryAfter) {
        const parsed = Number.parseInt(retryAfter, 10);
        if (!Number.isNaN(parsed)) err.retryAfter = parsed;
      }
      pending.reject(err);
      return true;
    }

    try {
      const text = new TextDecoder().decode(response.body);
      if (!text) {
        pending.resolve(null);
        return true;
      }
      try {
        pending.resolve(JSON.parse(text));
      } catch {
        pending.resolve(text);
      }
    } catch (err) {
      pending.resolve(null);
    }
    return true;
  } catch (error) {
    console.error("Failed to decode api response", error);
    return false;
  }
}

function queueWsRequest<T>(reqProto: ApiRequestProto): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const pending = pendingWsRequests.get(reqProto.requestId);
      if (!pending) return;
      pendingWsRequests.delete(reqProto.requestId);
      pending.reject(new Error("Timed out waiting for WebSocket API response"));
    }, WS_API_REQUEST_TIMEOUT_MS);
    pendingWsRequests.set(reqProto.requestId, { resolve, reject, timer });

    const ws = getGlobalWs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = encodeApiRequest(reqProto);
      sendWebSocketMessage(ws, {
        type: "api:request",
        payload: payload,
      });
    } else {
      clearTimeout(timer);
      pendingWsRequests.delete(reqProto.requestId);
      reject(new Error("WebSocket disconnected"));
    }
  });
}

export interface ExtendedRequestInit extends RequestInit {
  batch?: boolean;
}

/**
 * Make authenticated API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: ExtendedRequestInit = {}
): Promise<T> {
  const method = normalizedMethod(options);
  const ws = getGlobalWs();

  const useWs =
    WS_API_BRIDGE_ENABLED &&
    ws &&
    ws.readyState === WebSocket.OPEN &&
    !options.signal &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof ArrayBuffer);

  if (useWs) {
    const reqId = allocateWsRequestId();
    let bodyBytes = new Uint8Array();
    if (typeof options.body === "string") {
      bodyBytes = new TextEncoder().encode(options.body);
    } else if (options.body instanceof Uint8Array) {
      bodyBytes = options.body as any;
    }

    const headersObj: Record<string, string> = {};
    const mergedHeaders = mergeHeaders(getAuthHeaders(true), options.headers);
    mergedHeaders.forEach((val, key) => {
      headersObj[key] = val;
    });

    const reqProto: ApiRequestProto = {
      requestId: reqId,
      route: endpoint,
      method: method,
      body: bodyBytes,
      headers: headersObj,
    };

    if (shouldCoalesceRead(options)) {
      const key = requestCoalesceKey(endpoint, options);
      const existing = pendingAPIReads.get(key);
      if (existing) {
        return existing.promise as Promise<T>;
      }

      const promise = queueWsRequest<T>(reqProto);
      pendingAPIReads.set(key, {
        promise,
        timer: setTimeout(() => pendingAPIReads.delete(key), API_READ_COALESCE_WINDOW_MS),
      });

      void promise.then(
        () => {
          pendingAPIReads.delete(key);
        },
        () => {
          pendingAPIReads.delete(key);
        }
      );

      return promise;
    }

    return queueWsRequest<T>(reqProto);
  }

  if (shouldCoalesceRead(options)) {
    const key = requestCoalesceKey(endpoint, options);
    const existing = pendingAPIReads.get(key);
    if (existing) {
      return existing.promise as Promise<T>;
    }

    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const timer = setTimeout(() => {
      pendingAPIReads.delete(key);
      void performApiRequest<T>(endpoint, options).then(resolve, reject);
    }, API_READ_COALESCE_WINDOW_MS);
    pendingAPIReads.set(key, { promise, timer });
    return promise;
  }

  return performApiRequest<T>(endpoint, options);
}

async function performApiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

    const retryHeader = response.headers?.get("Retry-After");
    if (retryHeader) {
      const retry = Number.parseInt(retryHeader, 10);
      if (!Number.isNaN(retry)) {
        retryAfter = retry;
      }
    }
    if (retryAfter === undefined && typeof errorData?.retry_after === "number") {
      retryAfter = errorData.retry_after;
    }

    if (response.status === 429) {
      const requestHeaders = new Headers(options.headers || {});
      const isTotpBypass = requestHeaders.has("X-TOTP-Code") || requestHeaders.has("x-totp-code");

      if (!isTotpBypass) {
        toast.error(`${errorMessage}${retryAfter ? ` - retry after ${retryAfter}s` : ""}`);
        window.dispatchEvent(
          new CustomEvent("api:rate-limit", {
            detail: {
              retryAfter,
              requestUrl: url,
              challenge: errorData?.challenge,
              defconInfo: errorData?.defcon_info,
            },
          })
        );
      }
    }

    if (response.status === 403 && errorData?.reason_code === "account_provisional") {
      window.dispatchEvent(
        new CustomEvent("account:provisional", {
          detail: {
            tier: "provisional",
            established: false,
            totp_enabled: false,
            unlock_at: errorData.unlock_at,
            remaining_seconds: errorData.remaining_seconds,
          },
        })
      );
    }

    // Handle 503 - site may be armed (maintenance mode)
    if (response.status === 503 && errorMessage.toLowerCase().includes("armed")) {
      window.dispatchEvent(new CustomEvent("site:armed"));
      throw new Error(errorMessage);
    }

    // Handle 401 Unauthorized
    if (response.status === 401) {
      if (response.statusText === "MFA Required" || errorMessage === "MFA Required") {
        window.dispatchEvent(
          new CustomEvent<MFAChallengeContext>("auth:mfa-required", {
            detail: {
              reasonCode: errorData?.reason_code as MFAChallengeReason | undefined,
              action: errorData?.action,
            },
          })
        );
        throw new Error("MFA Required");
      }

      // Check if this 401 is an actual auth/token failure or a business logic 401 (e.g. invalid password)
      const isAuthFailure =
        /invalid session|session expired|invalid token|token parsing|missing or malformed jwt|unauthorized/i.test(
          errorMessage
        );

      if (isAuthFailure) {
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
                headers: mergeHeaders(getAuthHeaders(!isFormData), options.headers),
              });
              if (retryResp.ok) {
                try {
                  return await retryResp.json();
                } catch {
                  return null as T;
                }
              }
              // Retry also failed - fall through to clear auth
            }
          } catch {
            // Refresh request failed - fall through to clear auth
          }
        }

        // Clear auth tokens from localStorage
        localStorage.removeItem("auth.accessToken");
        localStorage.removeItem("auth.refreshToken");
        localStorage.removeItem("auth.user");
        localStorage.removeItem("auth.isAuthenticated");

        // Dispatch custom event that the app can listen to
        window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { errorMessage } }));
      }
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
 * Creates a keyed lazy API call. Calls made within the collection window share
 * one bounded request; each key retains an individual promise and no resolved
 * value is cached.
 */
export function apiRequestLazy<K, V, R>(
  endpoint: string,
  { buildBody, selectItems, keyOf, windowMs, maxBatchSize }: LazyApiRequestOptions<K, V, R>
): (key: K) => Promise<V> {
  const batcher = createRequestBatcher<K, V>({
    windowMs,
    maxBatchSize,
    loadBatch: async keys => {
      const response = await apiRequest<R>(endpoint, {
        method: "POST",
        body: JSON.stringify(buildBody(keys)),
      });
      return new Map(selectItems(response).map(item => [keyOf(item), item]));
    },
  });
  return batcher.load;
}

/**
 * Login user
 */
export async function loginUser(email: string, password: string): Promise<AuthResponse> {
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
  password: string
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
export async function refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
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
export async function uploadFile(file: File, endpoint: string): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  let token = localStorage.getItem("auth.accessToken");
  if (token?.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);
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

// Email Verification
export async function verifyEmail(token: string): Promise<{ status: string }> {
  return apiRequest("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendVerificationEmail(): Promise<{ status: string }> {
  return apiRequest("/auth/resend-verification", {
    method: "POST",
  });
}

// Password Reset
export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return apiRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ status: string }> {
  return apiRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

// TOTP / 2FA
export interface TOTPSetupResponse {
  secret: string;
  otpauth: string;
  qr_uri: string;
}

export interface TOTPEnableResponse {
  status: string;
  backup_codes: string[];
}

export async function loginTOTP(
  totpToken: string,
  totpCode?: string,
  backupCode?: string
): Promise<AuthResponse> {
  return apiRequest("/auth/login/totp", {
    method: "POST",
    body: JSON.stringify({
      totp_token: totpToken,
      totp_code: totpCode,
      backup_code: backupCode,
    }),
  });
}

export async function totpSetup(): Promise<TOTPSetupResponse> {
  return apiRequest("/auth/totp/setup", { method: "POST" });
}

export async function totpEnable(code: string): Promise<TOTPEnableResponse> {
  return apiRequest("/auth/totp/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export interface TOTPStatusResponse {
  enabled: boolean;
}

export async function totpStatus(userId?: string): Promise<TOTPStatusResponse> {
  return apiRequest(userId ? `/auth/totp/${userId}` : "/auth/totp");
}

export async function totpDisable(password: string): Promise<{ status: string }> {
  return apiRequest("/auth/totp/disable", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function verifyMFAChallenge(
  totpCode?: string,
  backupCode?: string
): Promise<{ status: string }> {
  return apiRequest("/auth/mfa-challenge", {
    method: "POST",
    body: JSON.stringify({
      totp_code: totpCode,
      backup_code: backupCode,
    }),
  });
}
