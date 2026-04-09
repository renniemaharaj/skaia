import { useAtom } from "jotai";
import type { Dispatch, SetStateAction } from "react";
import { guestSandboxAtom } from "../atoms/guestSandbox";

/**
 * Hook for guest sandbox mode state.
 *
 * This uses shared atom state instead of DOM observation to reduce frontend
 * load and keep sandbox mode consistent across components.
 */
export function useGuestSandboxMode(): [
  boolean,
  Dispatch<SetStateAction<boolean>>,
] {
  return useAtom(guestSandboxAtom);
}
