import { PLAYER_STATE, useLivePlayerContext } from "@twick/live-player";
import { TIMELINE_ACTION, useTimelineContext } from "@twick/timeline";
import { useCallback, useEffect, useMemo, useRef } from "react";

const PROJECT_REFRESH_TIMEOUT_MS = 8_000;
const FRAME_SEEK_TIMEOUT_MS = 200;
const FRAME_SEEK_TOLERANCE_SECONDS = 0.1;

export const useTwickPlayer = () => {
  const { present, totalDuration, timelineAction, setTimelineAction } = useTimelineContext();
  const { currentTime, setSeekTime, setCurrentTime, setPlayerState } =
    useLivePlayerContext() as any;

  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const pendingRefreshRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (timelineAction.type === TIMELINE_ACTION.ON_PLAYER_UPDATED) {
      pendingRefreshRef.current?.();
      pendingRefreshRef.current = null;
    }
  }, [timelineAction]);

  /** Loads `project` into the shared timeline/player and waits for it to render once. */
  const refreshProject = useCallback(
    (project: unknown) =>
      new Promise<void>(resolve => {
        const timeoutId = window.setTimeout(() => {
          pendingRefreshRef.current = null;
          resolve();
        }, PROJECT_REFRESH_TIMEOUT_MS);
        pendingRefreshRef.current = () => {
          window.clearTimeout(timeoutId);
          resolve();
        };
        setTimelineAction(TIMELINE_ACTION.UPDATE_PLAYER_DATA, project ?? present);
      }),
    [present, setTimelineAction]
  );

  /**
   * Seeks to `timeSeconds` and waits for the player's currentTime (fed back
   * through its real 'timeupdate' -> context.setCurrentTime pipeline) to
   * settle near the target, or for `timeoutMs` to elapse. Returns whether it
   * actually landed on the target frame.
   *
   * Deliberately does NOT touch playerState/PLAYING here: driving playback
   * via togglePlayback() while also seeking frame-by-frame fights the
   * player's own render loop and produces a frozen first frame — that's the
   * root cause of the "nothing records" bug.
   */
  const seekToFrame = useCallback(
    (timeSeconds: number, timeoutMs = FRAME_SEEK_TIMEOUT_MS) =>
      new Promise<boolean>(resolve => {
        setSeekTime(timeSeconds);

        const deadline = performance.now() + timeoutMs;
        const poll = () => {
          if (Math.abs(currentTimeRef.current - timeSeconds) <= FRAME_SEEK_TOLERANCE_SECONDS) {
            resolve(true);
            return;
          }
          if (performance.now() >= deadline) {
            resolve(false);
            return;
          }
          requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }),
    [setSeekTime]
  );

  /**
   * Keeps the real <twick-player> preview visible/opaque (canvasMode hides it
   * while playerState === PAUSED) without ever triggering togglePlayback(true).
   * REFRESH satisfies `playerState !== PAUSED` for the opacity check while
   * still evaluating to `false` for the `playerState === PLAYING` check that
   * drives togglePlayback, so real autoplay never engages.
   */
  const beginPreview = useCallback(() => {
    setPlayerState(PLAYER_STATE.REFRESH);
  }, [setPlayerState]);

  const endPreview = useCallback(() => {
    setCurrentTime(0);
    setSeekTime(0);
    setPlayerState(PLAYER_STATE.PAUSED);
  }, [setCurrentTime, setSeekTime, setPlayerState]);

  return useMemo(
    () => ({ totalDuration, refreshProject, seekToFrame, beginPreview, endPreview }),
    [totalDuration, refreshProject, seekToFrame, beginPreview, endPreview]
  );
};
