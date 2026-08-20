import type { CSSProperties } from "react";
import type { PresenceLauncherPosition } from "../../../atoms/presence";

interface Size {
  width: number;
  height: number;
}

const LAUNCHER_VIEWPORT_MARGIN = 8;
const INTERACTIVE_LAUNCHER_SELECTOR = "button, a, input, textarea, select, [role='button']";

export function isPresenceLauncherDragTarget(target: Element | null): boolean {
  return Boolean(target && !target.closest(INTERACTIVE_LAUNCHER_SELECTOR));
}

export function clampPresenceLauncherPosition(
  position: PresenceLauncherPosition,
  launcher: Size,
  viewport: Size
): PresenceLauncherPosition {
  const maxX = Math.max(
    LAUNCHER_VIEWPORT_MARGIN,
    viewport.width - launcher.width - LAUNCHER_VIEWPORT_MARGIN
  );
  const maxY = Math.max(
    LAUNCHER_VIEWPORT_MARGIN,
    viewport.height - launcher.height - LAUNCHER_VIEWPORT_MARGIN
  );

  return {
    x: Math.min(Math.max(position.x, LAUNCHER_VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, LAUNCHER_VIEWPORT_MARGIN), maxY),
  };
}

export function presenceLauncherStyle(
  expanded: boolean,
  position: PresenceLauncherPosition | null
): CSSProperties {
  if (expanded || !position) return {};
  return {
    left: position.x,
    top: position.y,
    right: "auto",
    bottom: "auto",
  };
}
