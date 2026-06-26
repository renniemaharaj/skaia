const GUEST_SESSION_KEY = "skaia.guestSessionId";

export function getGuestSessionId(): string {
  try {
    const existing = localStorage.getItem(GUEST_SESSION_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(GUEST_SESSION_KEY, generated);
    return generated;
  } catch {
    return "guest-session-unavailable";
  }
}
