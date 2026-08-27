import { describe, expect, it } from "vitest";
import {
  mergeSections,
  mutationFailureMessage,
  sortSections,
  stableStringify,
} from "./pageConvergence";
import type { PageSection } from "./types";

const section = (id: number, displayOrder: number): PageSection =>
  ({ id, display_order: displayOrder, items: [], config: "{}" }) as PageSection;

describe("page convergence", () => {
  it("sorts sections without mutating the source array", () => {
    const source = [section(2, 2), section(1, 1)];
    expect(sortSections(source).map(item => item.id)).toEqual([1, 2]);
    expect(source.map(item => item.id)).toEqual([2, 1]);
  });

  it("normalizes object key order for comparisons", () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("preserves references for unchanged sections", () => {
    const current = section(1, 1);
    const result = mergeSections([current], [{ ...current }]);
    expect(result[0]).toBe(current);
  });

  it("explains optimistic-concurrency conflicts", () => {
    const conflict = Object.assign(new Error("conflict"), { status: 409 });
    expect(mutationFailureMessage(conflict)).toContain("another editor");
  });
});
