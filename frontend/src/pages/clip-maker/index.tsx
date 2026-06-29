import { memo, useState, useEffect } from "react";
import TwickStudio, { TimelineProvider, LivePlayerProvider, type MediaItem } from "@twick/studio";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "../../atoms/auth";
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

export const ClipMakerPage = memo(() => {
  const currentUser = useAtomValue(currentUserAtom);
  const [mediaItems, setMediaItems] = useState<any[] | null>(null);

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
                exportVideo: async () => {
                  window.alert("Export successful!");
                  return { status: true, message: "Export completed" };
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
        </LivePlayerProvider>
      </TimelineProvider>
    </div>
  );
});

ClipMakerPage.displayName = "ClipMakerPage";
