import TwickStudio, { TimelineProvider, LivePlayerProvider } from "@twick/studio";
import { useAtomValue } from "jotai";
import { memo, useRef } from "react";
import { apiBaseUrlAtom } from "../../atoms/config";
import { useClipExport } from "./hooks/useClipExport";
import { useExportButtonSync } from "./hooks/useExportButtonSync";
import "./isolated-studio.css";

/**
 * Lives inside TimelineProvider + LivePlayerProvider so useClipExport can use
 * the real Twick context hooks (this is why it can't just be inline in
 * ClipMakerPage — TwickStudio and the export hook must be siblings under the
 * same providers).
 */
const StudioWithExport = memo(
  ({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) => {
    const apiBaseUrl = useAtomValue(apiBaseUrlAtom);
    const { exportVideo, isExporting, progress } = useClipExport({ apiBaseUrl, containerRef });

    useExportButtonSync(containerRef, isExporting);

    return (
      <>
        <TwickStudio
          studioConfig={{
            videoProps: { width: 1920, height: 1080 },
            exportVideo,
          }}
        />
        {isExporting && (
          <div className="clip-maker-export-overlay" role="status" aria-live="polite">
            <div className="clip-maker-export-dialog">
              <span className="clip-maker-export-spinner" aria-hidden="true" />
              <div>
                <div className="clip-maker-export-title">Exporting clip</div>
                <div className="clip-maker-export-message">
                  {progress || "Recording timeline..."}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
);
StudioWithExport.displayName = "StudioWithExport";

export const ClipMakerPage = memo(() => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={containerRef}
      className="twick-isolated-container"
      style={{
        width: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <TimelineProvider contextId="clip-maker">
        <LivePlayerProvider>
          <StudioWithExport containerRef={containerRef} />
        </LivePlayerProvider>
      </TimelineProvider>
    </div>
  );
});

ClipMakerPage.displayName = "ClipMakerPage";
