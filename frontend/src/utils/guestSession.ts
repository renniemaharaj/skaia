const GUEST_SESSION_KEY = "skaia.guestSessionId";
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
