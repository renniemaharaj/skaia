import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { flowStateAtom } from "../../../atoms/flow";
import { getFullState, getTrimmedState, memoizedGetLogicalFlow } from "../utils/extractFlow";

export default function useDownloadJSON({ depth }: { depth: "logical" | "full" }) {
  const flowProfile = useAtomValue(flowStateAtom);

  const downloadJSON = useCallback(() => {
    if (!flowProfile) return;

    let downloadData = {};

    if (depth === "logical") {
      downloadData = memoizedGetLogicalFlow(getTrimmedState(flowProfile));
    } else {
      downloadData = getFullState(flowProfile);
    }

    const jsonBlob = new Blob([JSON.stringify(downloadData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(jsonBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${flowProfile.name || "flow_profile"}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [flowProfile, depth]);

  return downloadJSON;
}
