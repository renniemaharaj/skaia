import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingSection } from "../types";
import {
  EditableText,
  SectionToolbar,
  ImagePickerButton,
  VideoPickerButton,
  ColorPickerButton,
  VariantCycler,
} from "../EditControls";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const HERO_VARIANTS = 2;

interface HeroCfg {
  background_image?: string;
  /** @deprecated kept for migration — now use `videos` array */
  video_url?: string;
  videos?: string[];
  tint_color?: string;
  tint_opacity?: number;
  variant?: number;
}

function parseCfg(config: string): HeroCfg {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

/** Migrate legacy single video_url into the videos array. */
function getVideos(cfg: HeroCfg): string[] {
  if (cfg.videos && cfg.videos.length > 0) return cfg.videos;
  if (cfg.video_url) return [cfg.video_url];
  return [];
}

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

export const HeroBlock = ({ section, canEdit, onUpdate, onDelete }: Props) => {
  const cfg = parseCfg(section.config);
  const bgImage = cfg.background_image || "/banner_7783x7783.png";
  const videos = getVideos(cfg);
  const tintColor = cfg.tint_color || "#000000";
  const tintOpacity = cfg.tint_opacity ?? 0.45;
  const variant = cfg.variant || 1;

  const [videoIdx, setVideoIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Clamp index when the array shrinks
  useEffect(() => {
    if (videoIdx >= videos.length) setVideoIdx(Math.max(0, videos.length - 1));
  }, [videos.length, videoIdx]);

  const currentVideo = videos[videoIdx] || "";

  const updateCfg = (updates: Partial<HeroCfg>) => {
    onUpdate({
      ...section,
      config: JSON.stringify({ ...cfg, ...updates }),
    });
  };

  // Advance to next video when the current one ends
  const handleVideoEnded = useCallback(() => {
    if (videos.length > 1) {
      setVideoIdx((prev) => (prev + 1) % videos.length);
    }
  }, [videos.length]);

  // Reload the <video> element whenever the current source changes
  useEffect(() => {
    if (variant === 2 && currentVideo && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [currentVideo, variant]);

  const tintStyle = {
    backgroundColor: tintColor,
    opacity: tintOpacity,
  };

  const isVideo = variant === 2;

  const addVideo = (url: string) => {
    updateCfg({ videos: [...videos, url] });
  };

  const removeVideo = (idx: number) => {
    const updated = videos.filter((_, i) => i !== idx);
    updateCfg({ videos: updated, video_url: undefined });
    if (videoIdx >= updated.length)
      setVideoIdx(Math.max(0, updated.length - 1));
  };

  const goPrev = () =>
    setVideoIdx((p) => (p - 1 + videos.length) % videos.length);
  const goNext = () => setVideoIdx((p) => (p + 1) % videos.length);

  return (
    <section className={`hero-banner hero-v${variant}`}>
      {/* Background */}
      {isVideo && currentVideo ? (
        <video
          ref={videoRef}
          className="banner-video"
          autoPlay
          muted
          loop={videos.length === 1}
          playsInline
          onEnded={handleVideoEnded}
        >
          <source src={currentVideo} />
        </video>
      ) : (
        <img src={bgImage} alt={section.heading} className="banner-image" />
      )}

      {/* Video cycling controls (non-edit visitors too) */}
      {isVideo && videos.length > 1 && (
        <div className="hero-video-nav">
          <button
            className="hero-video-nav-btn"
            onClick={goPrev}
            title="Previous video"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="hero-video-nav-counter">
            {videoIdx + 1} / {videos.length}
          </span>
          <button
            className="hero-video-nav-btn"
            onClick={goNext}
            title="Next video"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* Tint overlay */}
      <div className="banner-tint" style={tintStyle} />

      {/* Gradient + content overlay */}
      <div className="banner-overlay">
        <div className="banner-content">
          {canEdit ? (
            <>
              <SectionToolbar
                onDelete={() => onDelete(section.id)}
                label="Hero"
                extra={
                  <div className="hero-toolbar-row">
                    <VariantCycler
                      current={variant}
                      total={HERO_VARIANTS}
                      onCycle={(v) => updateCfg({ variant: v })}
                      label="Hero"
                    />
                    <ImagePickerButton
                      onUploaded={(url) => updateCfg({ background_image: url })}
                    />
                    {isVideo && <VideoPickerButton onUploaded={addVideo} />}
                    <ColorPickerButton
                      value={tintColor}
                      onChange={(c) => updateCfg({ tint_color: c })}
                      title="Tint color"
                    />
                    <label className="hero-opacity-slider" title="Tint opacity">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(tintOpacity * 100)}
                        onChange={(e) =>
                          updateCfg({
                            tint_opacity: Number(e.target.value) / 100,
                          })
                        }
                      />
                    </label>
                  </div>
                }
              />

              {/* Video list for managing multiple videos */}
              {isVideo && videos.length > 0 && (
                <div className="hero-video-list">
                  {videos.map((_url, i) => (
                    <div
                      key={i}
                      className={`hero-video-chip${i === videoIdx ? " active" : ""}`}
                      onClick={() => setVideoIdx(i)}
                    >
                      <span className="hero-video-chip-label">
                        Video {i + 1}
                      </span>
                      <button
                        className="hero-video-chip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeVideo(i);
                        }}
                        title="Remove video"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <EditableText
                value={section.heading}
                onSave={(v) => onUpdate({ ...section, heading: v })}
                tag="h1"
              />
              <EditableText
                value={section.subheading}
                onSave={(v) => onUpdate({ ...section, subheading: v })}
                tag="p"
              />
            </>
          ) : (
            <>
              <h1>{section.heading}</h1>
              <p>{section.subheading}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
