const RECORDER_EVENT_TIMEOUT_MS = 5_000;

export const mediaRecorderMimeType = () => {
  const candidates = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "";
};

const waitForRecorderStart = (recorder: MediaRecorder) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Browser recording did not start cleanly"));
    }, RECORDER_EVENT_TIMEOUT_MS);

    recorder.addEventListener(
      "start",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );
  });

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
  durationSeconds: number
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

      const waitForPaint = () =>
        new Promise<void>(resolve => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });

      const drawFrame = async () => {
        if (signal?.aborted) {
          reject(new DOMException("Export was cancelled", "AbortError"));
          return;
        }

        const frameTimeSeconds = Math.min(frameIndex / fps, durationSeconds);

        try {
          await renderFrame(frameIndex, frameTimeSeconds);
          await waitForPaint();
          context.drawImage(sourceCanvas, 0, 0, captureCanvas.width, captureCanvas.height);

          if (
            frameIndex === 0 ||
            frameIndex === Math.floor(totalFrames / 2) ||
            frameIndex === totalFrames - 1
          ) {
            const sample = context.getImageData(
              0,
              0,
              Math.min(4, captureCanvas.width),
              Math.min(4, captureCanvas.height)
            );
            console.debug("clipmaker capture sample", {
              frameIndex,
              frameTimeSeconds,
              dataUrlLength: captureCanvas.toDataURL("image/png").length,
              pixels: Array.from(sample.data.slice(0, 32)),
            });
          }

          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          console.count("clipmaker drew frame");
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

  // Use a real FPS stream instead of captureStream(0) + requestFrame().
  // Chrome can happily report requestFrame() calls while MediaRecorder still
  // writes only a tiny WebM header with no encoded video clusters.
  const stream = captureCanvas.captureStream(Math.max(1, fps));
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;

  console.debug("capture stream", {
    tracks: stream.getTracks().map(track => ({
      kind: track.kind,
      readyState: track.readyState,
      enabled: track.enabled,
      muted: track.muted,
    })),
  });

  if (!videoTrack || videoTrack.readyState !== "live") {
    stream.getTracks().forEach(track => track.stop());
    throw new Error("Browser recording video track is not available");
  }

  audioTracks.filter(track => track.readyState === "live").forEach(track => stream.addTrack(track));

  const chunks: Blob[] = [];
  const mimeType = mediaRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  recorder.addEventListener("start", () => console.debug("MediaRecorder start"));
  recorder.addEventListener("pause", () => console.debug("MediaRecorder pause"));
  recorder.addEventListener("resume", () => console.debug("MediaRecorder resume"));
  recorder.addEventListener("stop", () => console.debug("MediaRecorder stop"));

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", event => {
      if (event.data.size > 0) chunks.push(event.data);
      console.debug("clipmaker recorder chunk", {
        size: event.data.size,
        type: event.data.type,
        chunks: chunks.length,
        state: recorder.state,
      });
    });

    recorder.addEventListener("stop", () => {
      console.debug("clipmaker recorder stopped", {
        chunks: chunks.length,
        sizes: chunks.map(chunk => chunk.size),
        mimeType: recorder.mimeType,
      });
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    });

    recorder.addEventListener("error", () => {
      reject(new Error("Browser recording failed"));
    });
  });

  const pump = createCanvasFramePump(canvas, captureCanvas, fps, durationSeconds);

  try {
    if (signal?.aborted) {
      throw new DOMException("Export was cancelled", "AbortError");
    }

    recorder.start(250);
    await waitForRecorderStart(recorder);

    if (recorder.state !== "recording") {
      throw new Error("Browser recording did not start");
    }

    // Give MediaRecorder one compositor tick after start before drawing frames.
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));

    await pump.run(renderFrame, signal);

    console.debug("clipmaker video track before stop", {
      muted: videoTrack.muted,
      readyState: videoTrack.readyState,
      settings: videoTrack.getSettings(),
      streamTracks: stream.getTracks().map(track => ({
        kind: track.kind,
        muted: track.muted,
        readyState: track.readyState,
        enabled: track.enabled,
        settings: track.getSettings(),
      })),
      captureDataUrlLength: captureCanvas.toDataURL("image/png").length,
    });

    recorder.requestData();
    await new Promise<void>(resolve => window.setTimeout(resolve, 500));
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

  if (blob.size < 1024) {
    const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    throw new Error(
      `Browser recording was invalid; size=${blob.size}; header=${[...header]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join(" ")}; chunks=${chunks.length}; sizes=${chunks.map(chunk => chunk.size).join(",")}`
    );
  }

  return blob;
};
