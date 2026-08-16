import { type CSSProperties, type ReactElement, useState } from "react";
import "./MediaPlaceholder.css";

export type MediaType = "audio" | "image" | "video";

export interface MediaSize {
  aspectRatio?: string;
  height?: number | string;
  width?: number | string;
}

export interface MediaPlaceholderProps {
  alt: string;
  captionsHref?: string;
  href?: string;
  mediaType: MediaType;
  size?: MediaSize;
  /** Show native controls for audio and video. Defaults to true. */
  controls?: boolean;
}

type MediaStatus = "empty" | "error" | "loading" | "ready";

interface MediaState {
  href: string | undefined;
  status: MediaStatus;
}

function initialStatus(href: string | undefined): MediaStatus {
  return href ? "loading" : "empty";
}

export function MediaPlaceholder({
  alt,
  captionsHref,
  href,
  mediaType,
  size,
  controls = true,
}: MediaPlaceholderProps) {
  const [mediaState, setMediaState] = useState<MediaState>(() => ({
    href,
    status: initialStatus(href),
  }));
  const status = mediaState.href === href ? mediaState.status : initialStatus(href);
  const setStatus = (nextStatus: MediaStatus): void => {
    setMediaState({ href, status: nextStatus });
  };

  const style: CSSProperties = {
    aspectRatio: status === "ready" ? undefined : size?.aspectRatio,
    height: status === "ready" ? undefined : size?.height,
    maxWidth: "100%",
    width: size?.width,
  };
  const media = href
    ? renderMedia(href, alt, captionsHref, mediaType, status, setStatus, controls)
    : null;

  return (
    <figure
      aria-busy={status === "loading"}
      className="media-placeholder"
      data-media-status={status}
      style={style}
    >
      {media}
      {status === "loading" && (
        <div className="media-placeholder-skeleton" role="status">
          <span>Loading {alt}</span>
          <i />
          <i />
          <i />
        </div>
      )}
      {status === "empty" && (
        <div className="media-placeholder-message">
          <strong>Placeholder for asset here</strong>
          <span>{alt}</span>
          <small>{`Add a content server ${mediaType} URL to display this asset.`}</small>
        </div>
      )}
      {status === "error" && (
        <div className="media-placeholder-message" role="alert">
          <strong>Asset failed to load</strong>
          <span>{alt}</span>
          <small>The content server asset is unavailable.</small>
        </div>
      )}
      {status === "ready" && <figcaption>{alt}</figcaption>}
    </figure>
  );
}

function renderMedia(
  href: string,
  alt: string,
  captionsHref: string | undefined,
  mediaType: MediaType,
  status: MediaStatus,
  setStatus: (status: MediaStatus) => void,
  controls: boolean
): ReactElement {
  const className = status === "ready" ? "validated-media ready" : "validated-media";
  const failed = (): void => setStatus("error");
  const loaded = (): void => setStatus("ready");

  if (mediaType === "video") {
    return (
      <video
        aria-label={alt}
        className={className}
        controls={controls}
        onError={failed}
        onLoadedMetadata={loaded}
        preload="metadata"
        src={href}
      >
        {captionsHref && <track kind="captions" src={captionsHref} />}
      </video>
    );
  }

  if (mediaType === "audio") {
    return (
      <audio
        aria-label={alt}
        className={className}
        controls={controls}
        onError={failed}
        onLoadedMetadata={loaded}
        preload="metadata"
        src={href}
      >
        {captionsHref && <track kind="captions" src={captionsHref} />}
      </audio>
    );
  }

  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      onError={failed}
      onLoad={loaded}
      src={href}
    />
  );
}
