import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPolicyAccepted,
  readPolicyAcceptances,
  setPolicyAccepted,
  subscribeToPolicyAcceptance,
} from "./policyAcceptance";

describe("policyAcceptance", () => {
  beforeEach(() => localStorage.clear());

  it("stores and removes stable policy IDs", () => {
    expect(setPolicyAccepted("refunds", true)).toBe(true);
    expect(isPolicyAccepted("refunds")).toBe(true);

    setPolicyAccepted("refunds", false);
    expect(isPolicyAccepted("refunds")).toBe(false);
  });

  it("ignores malformed and non-string stored values", () => {
    localStorage.setItem("skaia.policy-acceptance.v1", '["privacy", 42, null]');
    expect([...readPolicyAcceptances()]).toEqual(["privacy"]);

    localStorage.setItem("skaia.policy-acceptance.v1", "not-json");
    expect(readPolicyAcceptances().size).toBe(0);
  });

  it("notifies subscribers after an update", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPolicyAcceptance(listener);
    setPolicyAccepted("cookies", true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
