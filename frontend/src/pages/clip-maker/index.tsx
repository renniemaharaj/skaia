import { memo, useState, useEffect } from "react";
import TwickStudio, { TimelineProvider, LivePlayerProvider, type MediaItem } from "@twick/studio";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { currentUserAtom } from "../../atoms/auth";
import { apiBaseUrlAtom } from "../../atoms/config";
import { apiRequest } from "../../utils/api";
import "./isolated-studio.css";

const getVideoMetadata = (
  url: string
): Promise<{ duration?: number; width?: number; height?: number }> => {
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = url;
    video.muted = true;

    let isResolved = false;
    const onResolve = (data: any) => {
      if (!isResolved) {
        isResolved = true;
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

export const ClipMakerPage = memo(() => {
  const currentUser = useAtomValue(currentUserAtom);
  const apiBaseUrl = useAtomValue(apiBaseUrlAtom);
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

  return (
    <div
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
                    const message = error?.message || "Export failed";
                    toast.error(message);
                    return { status: false, message };
                  } finally {
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

                        return {
                          name: u.filename,
                          type: isVideo ? "video" : isImage ? "image" : "audio",
                          url: u.url,
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
          {isExporting && (
            <div
              style={{
                position: "absolute",
                right: 16,
                bottom: 16,
                zIndex: 20,
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(15, 23, 42, 0.92)",
                color: "white",
                fontSize: 14,
                boxShadow: "0 12px 30px rgba(0, 0, 0, 0.25)",
              }}
            >
              Exporting clip...
            </div>
          )}
        </LivePlayerProvider>
      </TimelineProvider>
    </div>
  );
});

ClipMakerPage.displayName = "ClipMakerPage";
