import { createContext, useContext } from "react";

/** Status of the outgoing save pipeline. */
export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface PageBuilderContextValue {
  /** Number of components currently in active user-edit mode. */
  editingCount: number;
  /** Call when entering an interactive edit that produces rapid updates (color picker, rich-text, code editor). */
  enterEdit: () => void;
  /** Call when leaving that interactive edit. */
  leaveEdit: () => void;
  /** Current state of the outgoing save pipeline. */
  saveStatus: SaveStatus;
  /** True when an incoming page_updated WS event is being held because editing is active. */
  pendingIncoming: boolean;
}

const noop = () => {};

export const PageBuilderContext = createContext<PageBuilderContextValue>({
  editingCount: 0,
  enterEdit: noop,
  leaveEdit: noop,
  saveStatus: "idle",
  pendingIncoming: false,
});

export function usePageBuilderContext(): PageBuilderContextValue {
  return useContext(PageBuilderContext);
}
