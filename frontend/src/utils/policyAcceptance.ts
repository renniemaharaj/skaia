const STORAGE_KEY = "skaia.policy-acceptance.v1";
const UPDATE_EVENT = "policy:acceptance-updated";

export function readPolicyAcceptances(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function isPolicyAccepted(policyID: string) {
  return readPolicyAcceptances().has(policyID);
}

export function setPolicyAccepted(policyID: string, accepted: boolean) {
  const ids = readPolicyAcceptances();
  if (accepted) ids.add(policyID);
  else ids.delete(policyID);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  return true;
}

export function subscribeToPolicyAcceptance(listener: () => void) {
  window.addEventListener(UPDATE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
