import DOMPurify from "dompurify";
import parse, { type DOMNode, Element } from "html-react-parser";
import React, { useState } from "react";
import UserLink from "../user/UserLink";
import { MediaPlaceholder, type MediaSize, type MediaType } from "./MediaPlaceholder";
import { MediaPreviewLightbox, type PreviewMediaItem } from "./MediaPreviewLightbox";

interface RichTextRendererProps {
  html: string;
  className?: string;
  previewMode?: boolean;
}

function mediaSource(element: Element): string | undefined {
  if (element.attribs.src) return element.attribs.src;
  const source = element.children.find(
    child => child instanceof Element && child.name === "source" && child.attribs.src
  );
  return source instanceof Element ? source.attribs.src : undefined;
}

function captionsSource(element: Element): string | undefined {
  const track = element.children.find(
    child =>
      child instanceof Element &&
      child.name === "track" &&
      child.attribs.kind?.toLowerCase() === "captions" &&
      child.attribs.src
  );
  return track instanceof Element ? track.attribs.src : undefined;
}

function mediaSize(element: Element): MediaSize | undefined {
  const dimension = (value: string | undefined): number | string | undefined => {
    if (!value) return undefined;
    return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
  };
  const width = dimension(element.attribs.width);
  const height = dimension(element.attribs.height);
  return width || height ? { width, height } : undefined;
}

function mediaAlignment(element: Element): React.CSSProperties | undefined {
  const styleAlignment = element.attribs.style?.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right)/i)?.[1];
  const alignment = (element.attribs.align || styleAlignment)?.toLowerCase();

  if (alignment === "center") return { marginLeft: "auto", marginRight: "auto" };
  if (alignment === "right") return { marginLeft: "auto", marginRight: 0 };
  if (alignment === "left") return { marginLeft: 0, marginRight: "auto" };
  return undefined;
}

function richTextMedia(
  element: Element,
  mediaType: MediaType,
  onActivate?: () => void
) {
  const href = mediaSource(element);
  const alt = element.attribs.alt || element.attribs.title || `Embedded ${mediaType}`;
  const size = mediaSize(element);
  const preload = element.attribs.preload;

  return (
    <MediaPlaceholder
      alt={alt}
      autoPlay={"autoplay" in element.attribs}
      captionsHref={captionsSource(element)}
      className="rich-text-media-placeholder"
      controls={mediaType !== "image" && "controls" in element.attribs}
      href={href}
      loop={"loop" in element.attribs}
      mediaClassName={element.attribs.class}
      mediaType={mediaType}
      muted={"muted" in element.attribs}
      onActivate={onActivate}
      playsInline={"playsinline" in element.attribs}
      poster={element.attribs.poster}
      preload={preload === "auto" || preload === "none" ? preload : "metadata"}
      preserveFrame={Boolean(size)}
      showCaption={false}
      size={size}
      style={mediaType === "image" ? mediaAlignment(element) : undefined}
    />
  );
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  html,
  className = "",
  previewMode = false,
}) => {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // Sanitize HTML
  const sanitized = DOMPurify.sanitize(html);
  const previewItems: PreviewMediaItem[] = [];

  const options = {
    replace: (domNode: DOMNode) => {
      if (previewMode && domNode instanceof Element && /^h[1-6]$/i.test(domNode.name)) {
        if (domNode.attribs?.id) {
          delete domNode.attribs.id;
        }
      }

      if (domNode instanceof Element && domNode.name === "img") {
        const url = mediaSource(domNode);
        const alt = domNode.attribs.alt || domNode.attribs.title || "Embedded image";
        const index = previewItems.length;
        if (url) previewItems.push({ url, filename: alt, type: "image" });
        return richTextMedia(domNode, "image", url ? () => setPreviewIndex(index) : undefined);
      }

      if (domNode instanceof Element && (domNode.name === "video" || domNode.name === "audio")) {
        return richTextMedia(domNode, domNode.name);
      }

      if (
        domNode instanceof Element &&
        domNode.name === "span" &&
        domNode.attribs["data-type"] === "mention"
      ) {
        const id = domNode.attribs["data-id"] || domNode.attribs.id;
        const label =
          domNode.attribs["data-label"] ||
          domNode.attribs.label ||
          (domNode.children?.[0] ? (domNode.children[0] as any).data : "");
        // const type = domNode.attribs["data-mention-type"] || "user"; // Assume user by default, or maybe id has 'role-' prefix
        let badgeClass = "mention-badge";
        let text = `@${label || id}`;

        if (id === "special-here" || id === "special-everyone") {
          badgeClass += " mention-special";
          text = `@${id.replace("special-", "")}`;
        } else if (typeof id === "string" && id.startsWith("role-")) {
          badgeClass += " mention-role";
        } else if (typeof id === "string" && id.startsWith("user-")) {
          badgeClass += " mention-user";
        } else {
          badgeClass += " mention-user";
        }

        // You can make this interactive (e.g. UserLink)
        if (typeof id === "string" && id.startsWith("user-")) {
          const userId = id.replace("user-", "");
          return (
            <span className={badgeClass}>
              <UserLink userId={userId} displayName={text} />
            </span>
          );
        }

        return <span className={badgeClass}>{text}</span>;
      }
    },
  };

  return (
    <>
      <div className={`rich-text-renderer ${className}`}>{parse(sanitized, options)}</div>
      {previewIndex !== null && previewItems[previewIndex] && (
        <MediaPreviewLightbox
          items={previewItems}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
};
