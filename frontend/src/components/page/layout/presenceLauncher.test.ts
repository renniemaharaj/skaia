import { describe, expect, it } from "vitest";
import {
  clampPresenceLauncherPosition,
  isPresenceLauncherDragTarget,
  presenceLauncherStyle,
} from "./presenceLauncher";

describe("presence launcher positioning", () => {
  it("keeps the collapsed launcher inside the viewport", () => {
    expect(
      clampPresenceLauncherPosition(
        { x: 900, y: -20 },
        { width: 180, height: 40 },
        { width: 1000, height: 700 }
      )
    ).toEqual({ x: 812, y: 8 });
  });

  it("never applies the collapsed launcher position to the expanded panel", () => {
    expect(presenceLauncherStyle(false, { x: 120, y: 240 })).toEqual({
      left: 120,
      top: 240,
      right: "auto",
      bottom: "auto",
    });
    expect(presenceLauncherStyle(true, { x: 120, y: 240 })).toEqual({});
  });

  it("reserves buttons for clicks and uses control-bar gaps for dragging", () => {
    const controls = document.createElement("div");
    const gap = document.createElement("span");
    const button = document.createElement("button");
    const icon = document.createElement("svg");
    button.append(icon);
    controls.append(gap, button);

    expect(isPresenceLauncherDragTarget(controls)).toBe(true);
    expect(isPresenceLauncherDragTarget(gap)).toBe(true);
    expect(isPresenceLauncherDragTarget(button)).toBe(false);
    expect(isPresenceLauncherDragTarget(icon)).toBe(false);
  });
});
