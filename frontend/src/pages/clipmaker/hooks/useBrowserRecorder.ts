import { type RefObject, useCallback } from "react";
import { recordCanvas } from "../utils/mediaRecorder";
import { collectAudioTracks, findCaptureCanvas } from "../utils/twickDom";

export const useBrowserRecorder = (containerRef: RefObject<HTMLDivElement | null>) => {
  const capturePngFrames = useCallback(
    async ({
      width,
      height,
      renderFrame,
      signal,
    }: {
      width: number;
      height: number;
      renderFrame: (frameIndex: number, frameTimeSeconds: number) => Promise<void>;
      signal?: AbortSignal;
    }) => {
      const root = containerRef.current;
      if (!root) {
        throw new Error("Clipmaker is not ready yet");
      }

      const canvas = findCaptureCanvas(root);
      if (!canvas) {
        throw new Error("Could not find the preview canvas to record");
      }

      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = width || canvas.width;
      captureCanvas.height = height || canvas.height;
      const context = captureCanvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Could not create export capture canvas");
      }

      const waitForPaint = () =>
        new Promise<void>(resolve => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });

      const captureFrame = async () => {
        if (signal?.aborted) {
          throw new DOMException("Export was cancelled", "AbortError");
        }
        await waitForPaint();
        context.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);
        return new Promise<Blob>((resolve, reject) => {
          captureCanvas.toBlob(blob => {
            if (!blob) {
              reject(new Error("Could not encode preview frame"));
              return;
            }
            resolve(blob);
          }, "image/png");
        });
      };

      return {
        width: captureCanvas.width,
        height: captureCanvas.height,
        renderFrame,
        captureFrame,
      };
    },
    [containerRef]
  );

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
        throw new Error("Clipmaker is not ready yet");
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

  return { capturePngFrames, record };
};
