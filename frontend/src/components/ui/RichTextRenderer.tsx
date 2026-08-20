import DOMPurify from "dompurify";
import parse, { type DOMNode, Element } from "html-react-parser";
import type React from "react";
import UserLink from "../user/UserLink";
import { MediaPlaceholder, type MediaSize, type MediaType } from "./MediaPlaceholder";

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

function richTextMedia(element: Element, mediaType: Exclude<MediaType, "image">) {
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
      controls={"controls" in element.attribs}
      href={href}
      loop={"loop" in element.attribs}
      mediaClassName={element.attribs.class}
      mediaType={mediaType}
      muted={"muted" in element.attribs}
      playsInline={"playsinline" in element.attribs}
      poster={element.attribs.poster}
      preload={preload === "auto" || preload === "none" ? preload : "metadata"}
      preserveFrame={Boolean(size)}
      showCaption={false}
      size={size}
    />
  );
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  html,
  className = "",
  previewMode = false,
}) => {
  // Sanitize HTML
  const sanitized = DOMPurify.sanitize(html);

  const options = {
    replace: (domNode: DOMNode) => {
      if (previewMode && domNode instanceof Element && /^h[1-6]$/i.test(domNode.name)) {
        if (domNode.attribs?.id) {
          delete domNode.attribs.id;
        }
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

  return <div className={`rich-text-renderer ${className}`}>{parse(sanitized, options)}</div>;
};
