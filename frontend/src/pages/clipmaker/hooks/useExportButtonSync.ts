import { type RefObject, useEffect } from "react";
import { syncExportButtonState } from "../utils/twickDom";

/** Mirrors export progress into Twick's internally rendered button. */
export const useExportButtonSync = (
  containerRef: RefObject<HTMLDivElement | null>,
  isExporting: boolean
) => {
  useEffect(() => {
    const root = containerRef.current;
    syncExportButtonState(root, isExporting);
    if (!root || !isExporting) return;

    const observer = new MutationObserver(() => {
      syncExportButtonState(root, true);
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      syncExportButtonState(root, false);
    };
  }, [containerRef, isExporting]);
};
