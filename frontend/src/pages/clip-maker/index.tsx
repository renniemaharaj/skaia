import TwickStudio, { TimelineProvider, LivePlayerProvider, type MediaItem } from "@twick/studio";
import { useAtomValue } from "jotai";
import { memo, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { currentUserAtom } from "../../atoms/auth";
import { apiBaseUrlAtom } from "../../atoms/config";
import { apiRequest } from "../../utils/api";
import "./isolated-studio.css";

const EXPORT_TIMEOUT_MS = 2 * 60 * 1000;

const normalizeUploadUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith("/uploads/")) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Keep malformed or non-standard URLs as-is; Twick will surface the load error.
  }

  return url;
};

const getVideoMetadata = (
  url: string
): Promise<{ duration?: number; width?: number; height?: number }> => {
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = normalizeUploadUrl(url);
    video.muted = true;

    let isResolved = false;
    const onResolve = (data: any) => {
      if (!isResolved) {
        isResolved = true;
        video.removeAttribute("src");
        video.load();
        resolve(data);
      }
    };

    video.addEventListener("loadedmetadata", () => {
      onResolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    });

    video.addEventListener("error", () => onResolve({}));
    video.load();
    setTimeout(() => onResolve({}), 3000); // 3s fallback
  });
};

const downloadExport = async (apiBaseUrl: string, downloadUrl: string, filename: string) => {
  let token = localStorage.getItem("auth.accessToken");
  if (token?.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);

  const response = await fetch(`${apiBaseUrl}${downloadUrl}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error("Temporary export download failed");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "clip.mp4";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

const syncExportButtonState = (root: HTMLElement | null, isExporting: boolean) => {
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll("button"));
  const exportButtons = buttons.filter(button => {
    const text = (button.textContent || "").replace(/\s+/g, " ").trim();
    return button.dataset.clipMakerExportButton === "true" || text === "Export";
  });

  exportButtons.forEach(button => {
    if (isExporting) {
      const existingIcon = Array.from(button.children).find(child => {
        if (child.classList.contains("clip-maker-export-spinner")) return false;
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
      if (existingIcon && !existingIcon.hasAttribute("data-clip-maker-hidden-export-icon")) {
        existingIcon.setAttribute("data-clip-maker-hidden-export-icon", "true");
        existingIcon.setAttribute(
          "data-clip-maker-original-display",
          existingIcon.style.display || ""
        );
        existingIcon.style.display = "none";
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("clip-maker-export-button-loading");
      if (!button.querySelector(".clip-maker-export-spinner")) {
        const spinner = document.createElement("span");
        spinner.className = "clip-maker-export-spinner";
        spinner.setAttribute("aria-hidden", "true");
        button.prepend(spinner);
      }
      return;
    }

    const wasDisabled = button.dataset.clipMakerOriginalDisabled === "true";
    button.disabled = wasDisabled;
    button.removeAttribute("aria-busy");
    button.classList.remove("clip-maker-export-button-loading");
    button.querySelector(".clip-maker-export-spinner")?.remove();
    button
      .querySelectorAll<HTMLElement | SVGElement>("[data-clip-maker-hidden-export-icon]")
      .forEach(icon => {
        icon.style.display = icon.getAttribute("data-clip-maker-original-display") || "";
        icon.removeAttribute("data-clip-maker-hidden-export-icon");
        icon.removeAttribute("data-clip-maker-original-display");
      });
    delete button.dataset.clipMakerOriginalDisabled;
  });
};

export const ClipMakerPage = memo(() => {
  const currentUser = useAtomValue(currentUserAtom);
  const apiBaseUrl = useAtomValue(apiBaseUrlAtom);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mediaItems, setMediaItems] = useState<any[] | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) {
      setMediaItems([]);
      return;
    }
    apiRequest(`/upload/user/${currentUser.id}`)
      .then((data: any) => {
        if (Array.isArray(data)) {
          setMediaItems(data);
        } else {
          setMediaItems([]);
        }
      })
      .catch(() => setMediaItems([]));
  }, [currentUser?.id]);

  useEffect(() => {
    const root = containerRef.current;
    syncExportButtonState(root, isExporting);
    if (!root || !isExporting) return;

    const observer = new MutationObserver(() => {
      syncExportButtonState(root, true);
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      syncExportButtonState(root, false);
    };
  }, [isExporting]);

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
          {mediaItems !== null && (
            <TwickStudio
              studioConfig={{
                videoProps: { width: 1920, height: 1080 },
                exportVideo: async (...args: any[]) => {
                  const project =
                    args.find(arg => arg?.project)?.project ??
                    args.find(arg => arg?.timeline || arg?.tracks || arg?.items) ??
                    args[0];

                  if (!project) {
                    toast.error("Nothing to export yet.");
                    return { status: false, message: "Project is empty" };
                  }

                  setIsExporting(true);
                  const controller = new AbortController();
                  const timeoutId = window.setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
                  try {
                    const upload = await apiRequest<{
                      saved: boolean;
                      temporary?: boolean;
                      url: string;
                      download_url?: string;
                      filename: string;
                      size: number;
                      type: string;
                      expires_at?: string;
                      quota_error?: string;
                    }>("/clip-maker/export", {
                      method: "POST",
                      body: JSON.stringify({
                        project,
                        filename: `clip-${Date.now()}.mp4`,
                      }),
                      signal: controller.signal,
                    });

                    if (!upload.saved && upload.download_url) {
                      await downloadExport(apiBaseUrl, upload.download_url, upload.filename);
                      toast.info(
                        "Clip downloaded. It was not saved because your upload storage is full."
                      );
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
                      url: upload.url,
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
                    setIsExporting(false);
                  }
                },
                media: {
                  seed: async manager => {
                    // Prevent duplicates on re-renders
                    const existing = await manager.getItems();
                    const existingUrls = new Set(existing.map((e: any) => e.url));
                    const newItemsToSeed = mediaItems.filter(u => !existingUrls.has(u.url));

                    if (newItemsToSeed.length === 0) return;

                    const items = await Promise.all(
                      newItemsToSeed.map(async u => {
                        const isVideo = u.mime_type?.startsWith("video/") || u.type === "videos";
                        const isImage =
                          u.mime_type?.startsWith("image/") ||
                          u.type === "images" ||
                          u.type === "photos";

                        let meta = {};
                        if (isVideo) {
                          meta = await getVideoMetadata(u.url);
                        }
                        const url = normalizeUploadUrl(u.url);

                        return {
                          name: u.filename,
                          type: isVideo ? "video" : isImage ? "image" : "audio",
                          url,
                          sizeBytes: u.size,
                          source: "user",
                          origin: "upload",
                          ...meta,
                        };
                      })
                    );
                    await manager.addItems(items as MediaItem[]);
                  },
                },
              }}
            />
          )}
        </LivePlayerProvider>
      </TimelineProvider>
    </div>
  );
});

ClipMakerPage.displayName = "ClipMakerPage";
