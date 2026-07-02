import { useCallback, type RefObject } from "react";
import { recordCanvas } from "../utils/mediaRecorder";
import { collectAudioTracks, findCaptureCanvas } from "../utils/twickDom";

export const useBrowserRecorder = (containerRef: RefObject<HTMLDivElement | null>) => {
  const record = useCallback(
    async ({
      fps,
      durationSeconds,
      renderFrame,
      signal,
    }: {
      fps: number;
      durationSeconds: number;
      renderFrame: (frameIndex: number, frameTimeSeconds: number) => Promise<void>;
      signal?: AbortSignal;
    }) => {
      const root = containerRef.current;
      if (!root) {
        throw new Error("Clip maker is not ready yet");
      }

      const canvas = findCaptureCanvas(root);
      if (!canvas) {
        throw new Error("Could not find the preview canvas to record");
      }

      return recordCanvas({
        canvas,
        fps,
        durationSeconds,
        renderFrame,
        audioTracks: collectAudioTracks(root),
        signal,
      });
    },
    [containerRef]
  );

  return { record };
};
