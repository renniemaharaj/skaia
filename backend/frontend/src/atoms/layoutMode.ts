import { atomWithStorage } from "jotai/utils";

// "application" = header+body full height, footer hidden
// "web" = normal layout
export const layoutModeAtom = atomWithStorage<"application" | "web">(
  "layoutMode",
  "web",
);
