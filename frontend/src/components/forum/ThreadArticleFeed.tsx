import {
  BookOpen,
  ChevronUp,
  Eye,
  FileText,
  Heart,
  ImageIcon,
  MessageSquare,
  Pin,
  Share2,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ForumCategory } from "../../atoms/forum";
import type { FeedThread } from "../../hooks/useThreadsFeed";
import { relativeTimeAgo } from "../../utils/serverTime";
import UserAvatar from "../user/UserAvatar";
import UserLink from "../user/UserLink";
import UserProfileOverlay from "../user/UserProfileOverlay";
import "./ThreadArticleFeed.css";

interface Props {
  threads: FeedThread[];
  categories: ForumCategory[];
  isLoading: boolean;
  loading: boolean;
  feedRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  emptyMessage?: string;
}

interface ThreadPreview {
  text: string;
  media: Array<{ url: string; type: "image" | "video" | "file"; name: string }>;
}

const previewCache = new Map<string, ThreadPreview>();

const mediaName = (url: string) => {
  const filename = url.split("/").pop()?.split("?")[0] || "Attachment";
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
};

export function extractThreadPreview(html: string): ThreadPreview {
  const cached = previewCache.get(html);
  if (cached) return cached;

  if (!html) return { text: "", media: [] };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const media = new Map<string, ThreadPreview["media"][number]>();
  const addMedia = (url: string | null, type: "image" | "video" | "file") => {
    if (!url || url === "#" || url.startsWith("data:image/svg+xml") || media.has(url)) return;
    media.set(url, {
      url,
      type,
      name: mediaName(url),
    });
  };

  doc.querySelectorAll("img").forEach(node => addMedia(node.getAttribute("src"), "image"));
  doc.querySelectorAll("video").forEach(node => {
    addMedia(
      node.getAttribute("src") || node.querySelector("source")?.getAttribute("src") || null,
      "video"
    );
  });
  doc.querySelectorAll("iframe").forEach(node => {
    const url = node.getAttribute("src");
    if (url?.startsWith("/uploads/")) addMedia(url, "video");
  });
  doc.querySelectorAll(".attachment, [data-type='attachment']").forEach(node => {
    addMedia(
      node.querySelector("a")?.getAttribute("href") ||
        node.getAttribute("data-url") ||
        node.getAttribute("src"),
      "file"
    );
  });

  const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  const result = { text, media: Array.from(media.values()) };
  if (previewCache.size >= 250) previewCache.delete(previewCache.keys().next().value ?? "");
  previewCache.set(html, result);
  return result;
}

const MediaPreview = ({ media }: { media: ThreadPreview["media"] }) => {
  if (media.length === 0) return null;
  const visible = media.slice(0, 4);

  return (
    <div
      className={`thread-article-media thread-article-media--${Math.min(visible.length, 4)}`}
      aria-label={`${media.length} thread ${media.length === 1 ? "upload" : "uploads"}`}
    >
      {visible.map((item, index) => (
        <div className="thread-article-media-item" key={item.url} title={item.name}>
          {item.type === "image" ? (
            <img src={item.url} alt="" loading="lazy" />
          ) : item.type === "video" ? (
            <video src={item.url} muted preload="metadata" aria-label={item.name} />
          ) : (
            <div className="thread-article-file">
              <FileText size={24} />
              <span>{item.name}</span>
            </div>
          )}
          {index === visible.length - 1 && media.length > visible.length && (
            <span className="thread-article-media-more">+{media.length - visible.length}</span>
          )}
        </div>
      ))}
      <span className="thread-article-upload-count">
        <ImageIcon size={13} /> {media.length}
      </span>
    </div>
  );
};

export const ThreadArticleFeed = ({
  threads,
  categories,
  isLoading,
  loading,
  feedRef,
  sentinelRef,
  handleScroll,
  emptyMessage = "No articles found.",
}: Props) => {
  const categoryNames = new Map(categories.map(category => [category.id, category.name]));
  const newestFirst = [...threads].reverse();

  return (
    <div className="thread-article-feed" ref={feedRef} onScroll={handleScroll}>
      {isLoading ? (
        <div className="thread-article-state">Loading articles…</div>
      ) : newestFirst.length === 0 ? (
        <div className="thread-article-state">{emptyMessage}</div>
      ) : (
        newestFirst.map(thread => {
          const preview = extractThreadPreview(thread.content);
          const categoryName = categoryNames.get(thread.category_id) || "Forum";
          const authorName = thread.user_name || "Unknown";

          return (
            <article className="thread-article-card" key={thread.id}>
              <div className="thread-article-body">
                <header className="thread-article-header">
                  <UserProfileOverlay
                    userId={String(thread.user_id)}
                    fallbackName={authorName}
                    fallbackAvatar={thread.user_avatar}
                    fallbackRoles={thread.user_roles}
                  >
                    <div className="thread-article-avatar">
                      <UserAvatar
                        src={thread.user_avatar || undefined}
                        alt={authorName}
                        size={42}
                        initials={authorName[0]?.toUpperCase()}
                      />
                    </div>
                  </UserProfileOverlay>
                  <div className="thread-article-heading">
                    <div className="thread-article-eyebrow">
                      <span>{categoryName}</span>
                      <span aria-hidden="true">•</span>
                      <span>{relativeTimeAgo(thread.created_at)}</span>
                      {thread.is_pinned && <Pin size={12} aria-label="Pinned" />}
                      {thread.is_shared && <Share2 size={12} aria-label="Reshared" />}
                    </div>
                    <Link className="thread-article-title-link" to={`/view-thread/${thread.id}`}>
                      <h2>{thread.title}</h2>
                    </Link>
                    <div className="thread-article-byline">
                      By
                      <span onClick={event => event.preventDefault()}>
                        <UserLink
                          userId={String(thread.user_id)}
                          displayName={authorName}
                          variant="subtle"
                        />
                      </span>
                    </div>
                  </div>
                </header>

                <Link className="thread-article-content-link" to={`/view-thread/${thread.id}`}>
                  <p className="thread-article-excerpt">
                    {preview.text || "This article has no text preview."}
                  </p>
                </Link>

                <footer className="thread-article-footer">
                  <div className="thread-article-stats" aria-label="Article statistics">
                    <span title="Views">
                      <Eye size={14} /> {thread.view_count}
                    </span>
                    <span title="Replies">
                      <MessageSquare size={14} /> {thread.reply_count}
                    </span>
                    <span title="Likes">
                      <Heart size={14} /> {thread.likes ?? 0}
                    </span>
                    {preview.media.length > 0 && (
                      <span title="Uploads">
                        <ImageIcon size={14} /> {preview.media.length}
                      </span>
                    )}
                  </div>
                  <Link className="thread-article-read" to={`/view-thread/${thread.id}`}>
                    Read article <BookOpen size={14} />
                  </Link>
                </footer>
              </div>
              <MediaPreview media={preview.media} />
            </article>
          );
        })
      )}

      <div ref={sentinelRef} className="thread-article-sentinel">
        {loading && (
          <span>
            <ChevronUp size={15} /> Loading more articles…
          </span>
        )}
      </div>
    </div>
  );
};
