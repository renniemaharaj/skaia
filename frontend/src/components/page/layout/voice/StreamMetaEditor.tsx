import { Camera, Copy, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "../../../../utils/api";

interface StreamMeta {
  id: string;
  route: string;
  share_url: string;
  title: string;
  description: string;
  revision: string;
}

interface StreamMetaEditorProps {
  streamId: string;
  stream?: MediaStream | null;
}

export default function StreamMetaEditor({ streamId, stream }: StreamMetaEditorProps) {
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastPayloadRef = useRef("");

  const shareURL = useMemo(() => {
    const path = meta?.share_url || `/stream/${streamId}`;
    return new URL(path, window.location.origin).toString();
  }, [meta?.share_url, streamId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiRequest<StreamMeta>(`/stream-meta/${streamId}`)
      .then(data => {
        if (!alive) return;
        setMeta(data);
        setTitle(data.title || "");
        setDescription(data.description || "");
        lastPayloadRef.current = JSON.stringify({
          title: data.title || "",
          description: data.description || "",
          thumbnail: "",
        });
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [streamId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (stream) {
      void video.play().catch(() => {});
    }
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  const captureStillDataURL = useCallback(() => {
    const video = videoRef.current;
    if (!video || !stream || video.videoWidth === 0 || video.videoHeight === 0) {
      return "";
    }

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }, [stream]);

  useEffect(() => {
    if (loading) return;

    const capturedThumbnail = thumbnail || captureStillDataURL();
    const payload = JSON.stringify({ title, description, thumbnail: capturedThumbnail });
    if (payload === lastPayloadRef.current) return;

    const timer = window.setTimeout(() => {
      if (capturedThumbnail && !thumbnail) {
        setThumbnail(capturedThumbnail);
      }
      setSaving(true);
      lastPayloadRef.current = payload;
      apiRequest<StreamMeta>(`/stream-meta/${streamId}`, {
        method: "PUT",
        body: payload,
      })
        .then(setMeta)
        .catch(err => toast.error(err instanceof Error ? err.message : "Could not save stream"))
        .finally(() => setSaving(false));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [captureStillDataURL, description, loading, streamId, thumbnail, title]);

  const captureStill = useCallback(() => {
    const still = captureStillDataURL();
    if (!still) {
      toast.error("Start camera or screen sharing first");
      return;
    }

    setThumbnail(still);
  }, [captureStillDataURL]);

  const copyShareURL = useCallback(async () => {
    await navigator.clipboard.writeText(shareURL);
    toast.success("Stream link copied");
  }, [shareURL]);

  return (
    <div className="ui-panel vp-settings-panel vp-stream-meta">
      <div className="vp-stream-meta__head">
        <span>Stream Meta</span>
        <span className="vp-stream-meta__state">
          {loading ? "Loading" : saving ? <Loader2 size={12} className="vp-spin" /> : "Saved"}
        </span>
      </div>

      <input
        className="vp-stream-meta__input"
        value={title}
        maxLength={120}
        placeholder="Stream title"
        onChange={e => setTitle(e.target.value)}
      />
      <textarea
        className="vp-stream-meta__textarea"
        value={description}
        maxLength={280}
        placeholder="Stream description"
        rows={3}
        onChange={e => setDescription(e.target.value)}
      />

      <div className="vp-stream-meta__preview">
        <video
          ref={videoRef}
          muted
          playsInline
          className={thumbnail ? "vp-stream-meta__hidden-video" : undefined}
        />
        {thumbnail ? <img src={thumbnail} alt="" /> : null}
      </div>

      <div className="vp-stream-meta__actions">
        <button type="button" className="action-btn" title="Capture still" onClick={captureStill}>
          <Camera size={14} />
        </button>
        <button type="button" className="action-btn" title="Copy share link" onClick={copyShareURL}>
          <Copy size={14} />
        </button>
        <span className="vp-stream-meta__url">{shareURL}</span>
      </div>
    </div>
  );
}
