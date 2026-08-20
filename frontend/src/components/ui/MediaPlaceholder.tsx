import {
  Fragment,
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactElement,
  type Ref,
  useRef,
  useState,
} from "react";
import "./MediaPlaceholder.css";
import { MediaPreviewLightbox } from "./MediaPreviewLightbox";

export type MediaType = "audio" | "image" | "video";
export type MediaLayout = "background" | "block" | "fill" | "inline" | "thumbnail";
export type MediaFit = "contain" | "cover";

export interface MediaSize {
  aspectRatio?: string;
  height?: number | string;
  width?: number | string;
}

export interface MediaPlaceholderProps {
  alt: string;
  autoPlay?: boolean;
  captionsHref?: string;
  className?: string;
  /** Show native controls for audio and video. Defaults to true. */
  controls?: boolean;
  decorative?: boolean;
  fit?: MediaFit;
  href?: string;
  imageLoading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  layout?: MediaLayout;
  loop?: boolean;
  mediaClassName?: string;
  mediaStyle?: CSSProperties;
  mediaType: MediaType;
  muted?: boolean;
  /** Make the rendered media frame keyboard- and pointer-activatable. */
  onActivate?: () => void;
  /** Open this media in the shared lightbox when activated. Defaults to true. */
  previewable?: boolean;
  onEnded?: () => void;
  onError?: () => void;
  onReady?: () => void;
  playsInline?: boolean;
  poster?: string;
  preload?: "auto" | "metadata" | "none";
  /** Keep the configured frame after the asset loads. Defaults to true for non-block layouts. */
  preserveFrame?: boolean;
  showCaption?: boolean;
  size?: MediaSize;
  style?: CSSProperties;
  videoRef?: Ref<HTMLVideoElement>;
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
  autoPlay = false,
  captionsHref,
  className = "",
  controls = true,
  decorative = false,
  fit = "contain",
  href,
  imageLoading = "lazy",
  layout = "block",
  loop = false,
  mediaClassName = "",
  mediaStyle,
  mediaType,
  muted = false,
  onActivate,
  onEnded,
  onError,
  onReady,
  playsInline = false,
  poster,
  preload = "metadata",
  previewable = true,
  preserveFrame = layout !== "block",
  showCaption = layout === "block",
  size,
  style,
  videoRef,
}: MediaPlaceholderProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mediaState, setMediaState] = useState<MediaState>(() => ({
    href,
    status: initialStatus(href),
  }));
  const currentHrefRef = useRef(href);
  currentHrefRef.current = href;

  const status = mediaState.href === href ? mediaState.status : initialStatus(href);
  const setStatus = (eventHref: string, nextStatus: MediaStatus): void => {
    if (currentHrefRef.current !== eventHref) return;
    setMediaState({ href: eventHref, status: nextStatus });
    if (nextStatus === "ready") onReady?.();
    if (nextStatus === "error") onError?.();
  };

  const frameStyle: CSSProperties = {
    aspectRatio: status === "ready" && !preserveFrame ? undefined : size?.aspectRatio,
    height: status === "ready" && !preserveFrame ? undefined : size?.height,
    maxWidth: "100%",
    width: size?.width,
    ...style,
  };
  const media = href
    ? renderMedia({
        alt,
        autoPlay,
        captionsHref,
        controls,
        href,
        imageLoading,
        loop,
        mediaClassName,
        mediaStyle,
        mediaType,
        muted,
        onEnded,
        playsInline,
        poster,
        preload,
        setStatus,
        status,
        videoRef,
      })
    : null;
  const classes = [
    "media-placeholder",
    `media-placeholder--${layout}`,
    `media-placeholder--fit-${fit}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const activate =
    onActivate ?? (previewable && !decorative && href ? () => setPreviewOpen(true) : undefined);

  return (
    <Fragment>
      <figure
        aria-hidden={decorative || undefined}
        aria-busy={status === "loading"}
        aria-label={activate ? `Preview ${alt}` : undefined}
        className={classes}
        data-media-status={status}
        data-preserve-frame={preserveFrame}
        onClick={
          activate
            ? event => {
                event.preventDefault();
                event.stopPropagation();
                activate();
              }
            : undefined
        }
        onKeyDown={
          activate
            ? event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                activate();
              }
            : undefined
        }
        role={activate ? "button" : undefined}
        style={frameStyle}
        tabIndex={activate ? 0 : undefined}
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
        {status === "ready" && showCaption && <figcaption>{alt}</figcaption>}
      </figure>
      {previewOpen && href && (
        <MediaPreviewLightbox
          items={[{ url: href, filename: alt, type: mediaType }]}
          index={0}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </Fragment>
  );
}

interface RenderMediaOptions {
  alt: string;
  autoPlay: boolean;
  captionsHref: string | undefined;
  controls: boolean;
  href: string;
  imageLoading: ImgHTMLAttributes<HTMLImageElement>["loading"];
  loop: boolean;
  mediaClassName: string;
  mediaStyle: CSSProperties | undefined;
  mediaType: MediaType;
  muted: boolean;
  onEnded: (() => void) | undefined;
  playsInline: boolean;
  poster: string | undefined;
  preload: "auto" | "metadata" | "none";
  setStatus: (eventHref: string, status: MediaStatus) => void;
  status: MediaStatus;
  videoRef: Ref<HTMLVideoElement> | undefined;
}

function renderMedia({
  alt,
  autoPlay,
  captionsHref,
  controls,
  href,
  imageLoading,
  loop,
  mediaClassName,
  mediaStyle,
  mediaType,
  muted,
  onEnded,
  playsInline,
  poster,
  preload,
  setStatus,
  status,
  videoRef,
}: RenderMediaOptions): ReactElement {
  const className = ["validated-media", status === "ready" ? "ready" : "", mediaClassName]
    .filter(Boolean)
    .join(" ");
  const failed = (): void => setStatus(href, "error");
  const loaded = (): void => setStatus(href, "ready");

  if (mediaType === "video") {
    return (
      <video
        key={href}
        ref={videoRef}
        aria-label={alt}
        autoPlay={autoPlay}
        className={className}
        controls={controls}
        loop={loop}
        muted={muted}
        onEnded={onEnded}
        onError={failed}
        onLoadedMetadata={loaded}
        playsInline={playsInline}
        poster={poster}
        preload={preload}
        src={href}
        style={mediaStyle}
      >
        {captionsHref && <track kind="captions" src={captionsHref} />}
      </video>
    );
  }

  if (mediaType === "audio") {
    return (
      <audio
        key={href}
        aria-label={alt}
        autoPlay={autoPlay}
        className={className}
        controls={controls}
        loop={loop}
        muted={muted}
        onError={failed}
        onLoadedMetadata={loaded}
        preload={preload}
        src={href}
        style={mediaStyle}
      >
        {captionsHref && <track kind="captions" src={captionsHref} />}
      </audio>
    );
  }

  return (
    <img
      key={href}
      alt={alt}
      className={className}
      loading={imageLoading}
      onError={failed}
      onLoad={loaded}
      src={href}
      style={mediaStyle}
    />
  );
}
