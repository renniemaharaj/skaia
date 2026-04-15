import { Circle, Loader2, Check, AlertCircle, PauseCircle } from "lucide-react";
import { usePageBuilderContext } from "./PageBuilderContext";

/** Floating pill at the bottom that shows the current save pipeline state. */
export const SaveStatusBar = () => {
  const { saveStatus, editingCount } = usePageBuilderContext();

  if (saveStatus === "idle") return null;

  const holding = saveStatus === "pending" && editingCount > 0;

  return (
    <div className="page-save-bar" data-status={saveStatus}>
      {saveStatus === "pending" && !holding && (
        <>
          <Circle className="page-save-bar-pulse" size={7} />
          <span>Unsaved changes</span>
        </>
      )}
      {holding && (
        <>
          <PauseCircle size={12} />
          <span>Holding changes while editing…</span>
        </>
      )}
      {saveStatus === "saving" && (
        <>
          <Loader2 className="page-save-bar-spin" size={12} />
          <span>Saving…</span>
        </>
      )}
      {saveStatus === "saved" && (
        <>
          <Check size={12} />
          <span>Saved</span>
        </>
      )}
      {saveStatus === "error" && (
        <>
          <AlertCircle size={12} />
          <span>Save failed — changes may be lost</span>
        </>
      )}
    </div>
  );
};
