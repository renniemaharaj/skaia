import { useCallback, useState, type RefObject } from "react";
import { toast } from "sonner";
import { useBrowserRecorder } from "./useBrowserRecorder";
import { useTwickPlayer } from "./useTwickPlayer";
import { downloadExport, uploadRecording, type VideoSettingsLike } from "../utils/exportUpload";
import { projectDurationSeconds } from "../utils/project";

const EXPORT_TIMEOUT_MS = 2 * 60 * 1000;
const SETTLE_DELAY_MS = 150;

const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

export const useClipExport = ({
  apiBaseUrl,
  containerRef,
}: {
  apiBaseUrl: string;
  containerRef: RefObject<HTMLDivElement | null>;
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState("");

  const player = useTwickPlayer();
  const { record } = useBrowserRecorder(containerRef);

  const exportVideo = useCallback(
    async (project: any, videoSettings: VideoSettingsLike = {}) => {
      if (!project) {
        toast.error("Nothing to export yet.");
        return { status: false, message: "Project is empty" };
      }

      setIsExporting(true);
      setProgress("Preparing preview...");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);

      try {
        const fps = videoSettings.fps || 30;
        const durationSeconds = Math.max(
          projectDurationSeconds(project),
          player.totalDuration || 0,
          0.5
        );

        player.beginPreview();
        await player.refreshProject(project);
        await delay(SETTLE_DELAY_MS);

        setProgress("Recording timeline...");
        const recording = await record({
          fps,
          durationSeconds,
          signal: controller.signal,
          renderFrame: async (_frameIndex, frameTimeSeconds) => {
            await player.seekToFrame(frameTimeSeconds);
          },
        });

        setProgress("Finalizing MP4...");
        const upload = await uploadRecording(recording, videoSettings, controller.signal);

        if (!upload.saved && upload.download_url) {
          await downloadExport(apiBaseUrl, upload.download_url, upload.filename);
          toast.info("Clip downloaded. It was not saved because your upload storage is full.");
          return {
            status: true,
            message: "Export downloaded without saving",
            url: upload.download_url,
            filename: upload.filename,
          };
        }

        toast.success("Clip exported to your uploads.");
        return {
          status: true,
          message: "Export completed",
          url: upload.url || "",
          filename: upload.filename,
        };
      } catch (error: any) {
        const message =
          error?.name === "AbortError"
            ? "Export timed out. Please try a shorter clip or try again."
            : error?.message || "Export failed";
        toast.error(message);
        return { status: false, message };
      } finally {
        window.clearTimeout(timeoutId);
        player.endPreview();
        setIsExporting(false);
        setProgress("");
      }
    },
    [apiBaseUrl, player, record]
  );

  return { exportVideo, isExporting, progress };
};
