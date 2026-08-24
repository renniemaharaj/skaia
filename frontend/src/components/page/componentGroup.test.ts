import { describe, expect, it } from "vitest";
import { moveComponentItem, normalizeComponentWidth } from "./componentGroup";
import type { ComponentGroupItem } from "./types";

const items: ComponentGroupItem[] = [
  { id: "first", component_type: "primitive.text", bindings: {}, width: 50, order: 0 },
  { id: "second", component_type: "compound.stat", bindings: {}, width: 50, order: 1 },
  { id: "third", component_type: "primitive.text", bindings: {}, width: 100, order: 2 },
];

describe("component group controls", () => {
  it("moves components and normalizes their stored order", () => {
    const moved = moveComponentItem(items, "second", "up");

    expect(moved.map(item => item.id)).toEqual(["second", "first", "third"]);
    expect(moved.map(item => item.order)).toEqual([0, 1, 2]);
  });

  it("leaves boundary moves stable", () => {
    expect(moveComponentItem(items, "first", "up").map(item => item.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("accepts typed widths and clamps only when committed", () => {
    expect(normalizeComponentWidth("40", 100)).toBe(40);
    expect(normalizeComponentWidth("", 40)).toBe(40);
    expect(normalizeComponentWidth("4", 40)).toBe(10);
    expect(normalizeComponentWidth("125", 40)).toBe(100);
  });
});
