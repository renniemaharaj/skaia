const GUEST_SESSION_KEY = "skaia.guestSessionId";
const PENDING_RECOVERY_KEY = "skaia.pendingRecoveryRequest";
let memoryGuestSessionId: string | null = null;

function generateGuestSessionId(): string {
  if (typeof crypto !== "undefined") {
    const browserCrypto = crypto as Crypto & { randomUUID?: () => string };
    if (typeof browserCrypto.randomUUID === "function") {
      return browserCrypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Secure browser randomness is unavailable");
}

export function getGuestSessionId(): string {
  try {
    const existing = localStorage.getItem(GUEST_SESSION_KEY);
    if (existing) return existing;
    const generated = generateGuestSessionId();
    localStorage.setItem(GUEST_SESSION_KEY, generated);
    return generated;
  } catch {
    memoryGuestSessionId ??= generateGuestSessionId();
    return memoryGuestSessionId;
  }
}

export function rememberPendingRecoveryRequest(requestId: string, guestSessionId: string): void {
  if (!requestId || !guestSessionId) return;
  try {
    sessionStorage.setItem(PENDING_RECOVERY_KEY, JSON.stringify({ requestId, guestSessionId }));
  } catch {
    // Storage failures leave recovery pushes fail-closed.
  }
}

export function consumePendingRecoveryRequest(requestId: string, guestSessionId: string): boolean {
  if (!requestId || !guestSessionId) return false;
  try {
    const raw = sessionStorage.getItem(PENDING_RECOVERY_KEY);
    if (!raw) return false;
    const pending = JSON.parse(raw) as {
      requestId?: string;
      guestSessionId?: string;
    };
    if (pending.requestId !== requestId || pending.guestSessionId !== guestSessionId) {
      return false;
    }
    sessionStorage.removeItem(PENDING_RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}
