import { type CSSProperties, useState } from "react";
import { MediaPlaceholder } from "./MediaPlaceholder";
import "./MediaBackground.css";

interface MediaBackgroundProps {
  alt: string;
  className?: string;
  imageHref?: string | null;
  imagePosition?: string;
  repeatImage?: boolean;
  style?: CSSProperties;
  videoHref?: string | null;
}

export function MediaBackground({
  alt,
  className = "",
  imageHref,
  imagePosition = "center",
  repeatImage = false,
  style,
  videoHref,
}: MediaBackgroundProps) {
  const [readyImage, setReadyImage] = useState<string | null>(null);
  const imageReady = readyImage === imageHref;
  const classes = ["media-background", repeatImage ? "media-background--repeat" : "", className]
    .filter(Boolean)
    .join(" ");
  const backgroundStyle: CSSProperties = {
    ...style,
    backgroundImage:
      repeatImage && imageHref && imageReady ? `url(${JSON.stringify(imageHref)})` : undefined,
    backgroundPosition: imagePosition,
  };

  if (videoHref) {
    return (
      <MediaPlaceholder
        alt={alt}
        autoPlay
        className={classes}
        controls={false}
        decorative
        fit="cover"
        href={videoHref}
        layout="background"
        loop
        mediaType="video"
        muted
        playsInline
        preserveFrame
        showCaption={false}
        size={{ height: "100%", width: "100%" }}
        style={style}
      />
    );
  }

  return (
    <MediaPlaceholder
      alt={alt}
      className={classes}
      decorative
      fit={repeatImage ? "contain" : "cover"}
      href={imageHref || undefined}
      layout="background"
      mediaType="image"
      onReady={() => setReadyImage(imageHref || null)}
      preserveFrame
      showCaption={false}
      size={{ height: "100%", width: "100%" }}
      style={backgroundStyle}
    />
  );
}
