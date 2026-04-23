import { atomWithStorage } from "jotai/utils";

// "application" = header+body full height, footer hidden
// "web" = normal layout
function getDefaultLayoutMode(): "application" | "web" {
  if (typeof window !== "undefined") {
    // Basic mobile detection
    if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
      return "application";
    }
  }
  return "web";
}

export const layoutModeAtom = atomWithStorage<"application" | "web">(
  "layoutMode",
  getDefaultLayoutMode(),
);
