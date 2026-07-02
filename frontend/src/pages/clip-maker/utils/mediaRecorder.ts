const RECORDER_EVENT_TIMEOUT_MS = 5_000;

export const mediaRecorderMimeType = () => {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "";
};

const stopRecorder = (recorder: MediaRecorder) =>
  new Promise<void>((resolve, reject) => {
    if (recorder.state === "inactive") {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      reject(new Error("Browser recording did not finish cleanly"));
    }, RECORDER_EVENT_TIMEOUT_MS);

    recorder.addEventListener(
      "stop",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );

    try {
      recorder.stop();
    } catch (error) {
      window.clearTimeout(timeoutId);
      reject(error);
    }
  });

export type FramePump = {
  totalFrames: number;
  run: (
    renderFrame: (frameIndex: number, frameTimeSeconds: number) => Promise<void>,
    signal?: AbortSignal
  ) => Promise<void>;
};

export const createCanvasFramePump = (
  sourceCanvas: HTMLCanvasElement,
  captureCanvas: HTMLCanvasElement,
  fps: number,
  durationSeconds: number,
  videoTrack?: CanvasCaptureMediaStreamTrack
): FramePump => {
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * fps));
  const frameIntervalMs = 1000 / Math.max(fps, 1);

  const run = (
    renderFrame: (frameIndex: number, frameTimeSeconds: number) => Promise<void>,
    signal?: AbortSignal
  ) =>
    new Promise<void>((resolve, reject) => {
      const context = captureCanvas.getContext("2d", { alpha: false });
      if (!context) {
        reject(new Error("Could not create export capture canvas"));
        return;
      }

      const startedAt = performance.now();
      let frameIndex = 0;

      const drawFrame = async () => {
        if (signal?.aborted) {
          reject(new DOMException("Export was cancelled", "AbortError"));
          return;
        }

        const frameTimeSeconds = Math.min(frameIndex / fps, durationSeconds);

        try {
          await renderFrame(frameIndex, frameTimeSeconds);
          context.drawImage(sourceCanvas, 0, 0, captureCanvas.width, captureCanvas.height);
          videoTrack?.requestFrame();
        } catch (error) {
          reject(
            error instanceof Error ? error : new Error("Could not capture the preview canvas")
          );
          return;
        }

        frameIndex += 1;
        if (frameIndex >= totalFrames) {
          resolve();
          return;
        }

        const nextFrameAt = startedAt + frameIndex * frameIntervalMs;
        window.setTimeout(
          () => window.requestAnimationFrame(drawFrame),
          Math.max(0, nextFrameAt - performance.now())
        );
      };

      drawFrame();
    });

  return { totalFrames, run };
};

export const recordCanvas = async ({
  canvas,
  fps,
  durationSeconds,
  renderFrame,
  audioTracks = [],
  signal,
}: {
  canvas: HTMLCanvasElement;
  fps: number;
  durationSeconds: number;
  renderFrame: (frameIndex: number, frameTimeSeconds: number) => Promise<void>;
  audioTracks?: MediaStreamTrack[];
  signal?: AbortSignal;
}): Promise<Blob> => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error("Preview canvas is not ready for recording");
  }

  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = canvas.width;
  captureCanvas.height = canvas.height;

  const context = captureCanvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Could not create export capture canvas");
  }

  context.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);

  const stream = captureCanvas.captureStream(30);
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;

  if (!videoTrack || videoTrack.readyState !== "live") {
    stream.getTracks().forEach(track => track.stop());
    throw new Error("Browser recording video track is not available");
  }

  audioTracks.filter(track => track.readyState === "live").forEach(track => stream.addTrack(track));

  const chunks: Blob[] = [];
  const mimeType = mediaRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", event => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    });

    recorder.addEventListener("error", () => {
      reject(new Error("Browser recording failed"));
    });
  });

  const pump = createCanvasFramePump(canvas, captureCanvas, fps, durationSeconds, videoTrack);

  try {
    if (signal?.aborted) {
      throw new DOMException("Export was cancelled", "AbortError");
    }

    recorder.start(250);

    if (recorder.state !== "recording") {
      throw new Error("Browser recording did not start");
    }

    await pump.run(renderFrame, signal);
    await stopRecorder(recorder);
  } catch (error) {
    if (recorder.state !== "inactive") {
      await stopRecorder(recorder).catch(() => undefined);
    }

    stream.getTracks().forEach(track => track.stop());
    throw error;
  }

  const blob = await stopped.finally(() => {
    stream.getTracks().forEach(track => track.stop());
  });

  if (blob.size === 0) {
    throw new Error("Browser recording was empty");
  }

  return blob;
};
