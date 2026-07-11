export type TwickPlayerElement = HTMLElement & {
  playing?: boolean | string;
  player?: { playback?: { fps?: number }; togglePlayback?: (playing: boolean) => void };
};

/**
 * Recursively walks light DOM + shadow DOM (Twick renders inside shadow roots),
 * calling `visit` for every element encountered.
 */
export const walkComposedTree = (
  root: ParentNode | ShadowRoot,
  visit: (element: Element) => void
) => {
  root.querySelectorAll("*").forEach(element => {
    visit(element);
    if (element.shadowRoot) {
      walkComposedTree(element.shadowRoot, visit);
    }
  });
};

/**
 * Finds the <twick-player> custom element rendered by @twick/live-player.
 * There is only ever one live player mounted per studio instance, so the
 * first match is the one driving the visible preview.
 */
export const findTwickPlayer = (root: HTMLElement): TwickPlayerElement | null => {
  const players = Array.from(root.querySelectorAll("twick-player"));
  return (players[0] as TwickPlayerElement | undefined) ?? null;
};

/**
 * Finds the canvas that actually renders frames for capture.
 *
 * Note: @twick/video-editor runs in canvasMode, which means there are two
 * canvases in the DOM at once — the <twick-player>'s own render canvas, and a
 * separate plain <canvas class="twick-editor-canvas"> used to draw a single
 * static frame while playback is paused (for selection/editing). Opacity is
 * toggled between the two, but both keep rendering regardless of visibility.
 * For export we always want the <twick-player> canvas, since that's the one
 * driven by real playback/seek.
 */
export const findCaptureCanvas = (root: HTMLElement): HTMLCanvasElement | null => {
  const playerCanvases: HTMLCanvasElement[] = [];
  root.querySelectorAll("twick-player").forEach(player => {
    const collect = (element: Element) => {
      if (element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0) {
        playerCanvases.push(element);
      }
    };
    player.querySelectorAll("*").forEach(collect);
    if (player.shadowRoot) {
      walkComposedTree(player.shadowRoot, collect);
    }
  });

  if (playerCanvases.length > 0) {
    playerCanvases.sort((a, b) => b.width * b.height - a.width * a.height);
    return playerCanvases[0];
  }

  // Fallback: search the whole tree in case the player's internal structure changes.
  const canvases: HTMLCanvasElement[] = [];
  walkComposedTree(root, element => {
    if (element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0) {
      canvases.push(element);
    }
  });
  canvases.sort((a, b) => b.width * b.height - a.width * a.height);
  return canvases[0] ?? null;
};

/** Collects audio tracks from any playable media elements under root (video/audio clips). */
export const collectAudioTracks = (root: HTMLElement): MediaStreamTrack[] => {
  const tracks: MediaStreamTrack[] = [];
  walkComposedTree(root, element => {
    if (!(element instanceof HTMLMediaElement)) return;
    const captureStream =
      (
        element as HTMLMediaElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        }
      ).captureStream ??
      (element as HTMLMediaElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
    if (!captureStream) return;
    try {
      captureStream
        .call(element)
        .getAudioTracks()
        .forEach(track => tracks.push(track));
    } catch {
      // Some browser/media combinations refuse capture; video-only export is still useful.
    }
  });
  return tracks;
};

/**
 * Purely cosmetic: shows a spinner + disables the Studio's own "Export" button
 * while our export pipeline is running, since Twick doesn't expose a prop for this.
 */
export const syncExportButtonState = (root: HTMLElement | null, isExporting: boolean) => {
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll("button"));
  const exportButtons = buttons.filter(button => {
    const text = (button.textContent || "").replace(/\s+/g, " ").trim();
    return button.dataset.clipMakerExportButton === "true" || text === "Export";
  });

  exportButtons.forEach(button => {
    if (isExporting) {
      const existingIcon = Array.from(button.children).find(child => {
        if (child.classList.contains("clipmaker-export-spinner")) return false;
        const tagName = child.tagName.toLowerCase();
        const className =
          typeof child.className === "string"
            ? child.className
            : (child.getAttribute("class") ?? "");
        return (
          tagName === "svg" || tagName === "img" || /(^|\s)(icon|lucide)(\s|$)/i.test(className)
        );
      }) as HTMLElement | SVGElement | undefined;

      button.dataset.clipMakerExportButton = "true";
      if (!button.dataset.clipMakerOriginalDisabled) {
        button.dataset.clipMakerOriginalDisabled = button.disabled ? "true" : "false";
      }
      if (existingIcon && !existingIcon.hasAttribute("data-clipmaker-hidden-export-icon")) {
        existingIcon.setAttribute("data-clipmaker-hidden-export-icon", "true");
        existingIcon.setAttribute(
          "data-clipmaker-original-display",
          existingIcon.style.display || ""
        );
        existingIcon.style.display = "none";
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("clipmaker-export-button-loading");
      if (!button.querySelector(".clipmaker-export-spinner")) {
        const spinner = document.createElement("span");
        spinner.className = "clipmaker-export-spinner";
        spinner.setAttribute("aria-hidden", "true");
        button.prepend(spinner);
      }
      return;
    }

    const wasDisabled = button.dataset.clipMakerOriginalDisabled === "true";
    button.disabled = wasDisabled;
    button.removeAttribute("aria-busy");
    button.classList.remove("clipmaker-export-button-loading");
    button.querySelector(".clipmaker-export-spinner")?.remove();
    button
      .querySelectorAll<HTMLElement | SVGElement>("[data-clipmaker-hidden-export-icon]")
      .forEach(icon => {
        icon.style.display = icon.getAttribute("data-clipmaker-original-display") || "";
        icon.removeAttribute("data-clipmaker-hidden-export-icon");
        icon.removeAttribute("data-clipmaker-original-display");
      });
    delete button.dataset.clipMakerOriginalDisabled;
  });
};
