import { FileIcon } from "lucide-react";
import { MediaPlaceholder } from "../ui/MediaPlaceholder";

interface MessageAttachmentProps {
  messageType: string;
  name?: string;
  size?: number;
  url?: string;
}

export function MessageAttachment({ messageType, name, size, url }: MessageAttachmentProps) {
  if (!url) return null;

  if (messageType === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <MediaPlaceholder
          alt={name || "Message image"}
          className="inbox-msg-image"
          href={url}
          mediaType="image"
          preserveFrame={false}
          showCaption={false}
          size={{ aspectRatio: "1 / 1", width: 300 }}
        />
      </a>
    );
  }

  if (messageType === "video") {
    return (
      <MediaPlaceholder
        alt={name || "Message video"}
        className="inbox-msg-video"
        controls
        href={url}
        mediaType="video"
        playsInline
        preserveFrame={false}
        showCaption={false}
        size={{ aspectRatio: "16 / 9", width: 360 }}
      />
    );
  }

  if (messageType === "audio") {
    return (
      <MediaPlaceholder
        alt={name || "Message audio"}
        className="inbox-msg-audio"
        controls
        href={url}
        mediaType="audio"
        preserveFrame={false}
        showCaption={false}
        size={{ height: 54, width: 300 }}
      />
    );
  }

  if (messageType === "file") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inbox-msg-file">
        <FileIcon size={16} />
        <span>{name || "Download file"}</span>
        {size ? <span className="inbox-msg-file-size">{(size / 1024).toFixed(0)} KB</span> : null}
      </a>
    );
  }

  return null;
}
