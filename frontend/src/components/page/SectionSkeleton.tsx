import type { ReactNode } from "react";
import { SkeletonPrimitive, SkeletonText } from "../ui/Skeleton";
import type { PageSection } from "./types";

interface SectionSkeletonProps {
  section: PageSection;
}

type CollectionKind = "card" | "event" | "feature" | "stat";

function safeConfig(section: PageSection): Record<string, unknown> {
  if (section.config && typeof section.config === "object") {
    return section.config as Record<string, unknown>;
  }
  if (typeof section.config === "string") {
    try {
      const parsed: unknown = JSON.parse(section.config);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function configuredCount(section: PageSection): number {
  if (Array.isArray(section.items) && section.items.length > 0) {
    return Math.min(section.items.length, 6);
  }
  const config = safeConfig(section);
  for (const key of ["fields", "options", "questions", "links", "items", "events"]) {
    const value = config[key];
    if (Array.isArray(value)) return Math.min(value.length, 6);
  }
  return 0;
}

function configuredArrayCount(section: PageSection, key: string): number {
  const value = safeConfig(section)[key];
  return Array.isArray(value) ? Math.min(value.length, 6) : 0;
}

export function sectionSkeletonHeight(section: PageSection): number {
  const count = configuredCount(section);
  switch (section.section_type) {
    case "hero":
      return 500;
    case "card_group":
      return count > 0 ? 560 : 220;
    case "stat_cards":
      return count > 3 ? 390 : count > 0 ? 290 : 180;
    case "feature_grid":
      return count > 3 ? 560 : count > 0 ? 390 : 220;
    case "event_highlights":
      return count > 0 ? 560 : 220;
    case "image_gallery":
      return count > 3 ? 880 : count > 0 ? 540 : 220;
    case "cta":
      return 260;
    case "profile_card":
      return 880;
    case "social_links":
      return configuredArrayCount(section, "links") > 0 ? 88 : 40;
    case "rich_text":
      return 280;
    case "code_editor":
      return 380;
    case "data_sources":
    case "derived_section":
    case "custom_section":
      return 300;
    case "form":
    case "qa":
    case "survey":
    case "poll":
    case "vote":
      return 190 + Math.max(1, Math.ceil(count / 2)) * 64;
    default:
      return 160;
  }
}

function Heading({ compact = false }: { compact?: boolean }) {
  return (
    <div className="section-skeleton__heading">
      <SkeletonPrimitive width={compact ? "36%" : "44%"} height={compact ? 24 : 32} />
      <SkeletonPrimitive width={compact ? "52%" : "62%"} height={14} />
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div
      className="section-skeleton section-skeleton--hero skeleton-pb-hero"
      data-skeleton-kind="hero"
    >
      <div className="section-skeleton__hero-shade" />
      <div className="section-skeleton__hero-copy">
        <SkeletonPrimitive width="40%" height={36} />
        <SkeletonPrimitive width="55%" height={18} />
      </div>
    </div>
  );
}

function CollectionSkeleton({ section, kind }: { section: PageSection; kind: CollectionKind }) {
  const count = configuredCount(section);
  return (
    <div
      className={`section-skeleton section-skeleton--collection section-skeleton--${kind}`}
      data-skeleton-kind={kind}
    >
      <Heading />
      {count > 0 && (
        <div className="section-skeleton__collection-grid">
          {Array.from({ length: count }, (_, index) => (
            <div className="section-skeleton__collection-item" key={`${kind}-${index}`}>
              {kind === "event" && (
                <SkeletonPrimitive shape="media" className="section-skeleton__event-media" />
              )}
              {(kind === "feature" || kind === "stat") && (
                <SkeletonPrimitive
                  shape="avatar"
                  width={kind === "stat" ? 52 : 64}
                  height={kind === "stat" ? 52 : 64}
                />
              )}
              <div className="section-skeleton__collection-copy">
                <SkeletonPrimitive
                  width={kind === "stat" ? "54%" : "68%"}
                  height={kind === "stat" ? 28 : 20}
                />
                <SkeletonText lines={kind === "stat" ? 1 : 3} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GallerySkeleton({ section }: SectionSkeletonProps) {
  const count = configuredCount(section);
  const config = safeConfig(section);
  const albumCount = Array.isArray(config.albums) ? Math.min(config.albums.length, 4) : 0;
  return (
    <div className="section-skeleton section-skeleton--gallery" data-skeleton-kind="gallery">
      <Heading />
      {albumCount > 0 && (
        <div className="section-skeleton__pills">
          {Array.from({ length: albumCount }, (_, index) => (
            <SkeletonPrimitive key={`album-${index}`} width={74} height={32} />
          ))}
        </div>
      )}
      {count > 0 && (
        <div className="section-skeleton__gallery-grid">
          {Array.from({ length: count }, (_, index) => (
            <SkeletonPrimitive
              key={`gallery-${index}`}
              shape="media"
              className="section-skeleton__gallery-media"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CTASkeleton() {
  return (
    <div className="section-skeleton section-skeleton--cta" data-skeleton-kind="cta">
      <SkeletonPrimitive width="38%" height={32} />
      <SkeletonPrimitive width="58%" height={15} />
    </div>
  );
}

function ProfileSkeleton({ section }: SectionSkeletonProps) {
  const checklistCount = configuredArrayCount(section, "checklist");
  const linkCount = configuredArrayCount(section, "links");
  return (
    <div className="section-skeleton section-skeleton--profile" data-skeleton-kind="profile">
      <Heading />
      <div className="section-skeleton__profile-layout">
        <div className="section-skeleton__profile-card">
          <SkeletonPrimitive shape="media" className="section-skeleton__profile-banner" />
          <SkeletonPrimitive
            shape="avatar"
            width={120}
            height={120}
            className="section-skeleton__profile-avatar"
          />
          <div className="section-skeleton__profile-copy">
            <SkeletonPrimitive width="42%" height={26} />
            <SkeletonPrimitive width="24%" height={14} />
            {linkCount > 0 && (
              <div className="section-skeleton__profile-links">
                {Array.from({ length: linkCount }, (_, index) => (
                  <SkeletonPrimitive key={`profile-link-${index}`} width={74} height={28} />
                ))}
              </div>
            )}
          </div>
        </div>
        {checklistCount > 0 && (
          <div className="section-skeleton__profile-list">
            {Array.from({ length: checklistCount }, (_, index) => (
              <div className="section-skeleton__profile-list-item" key={`profile-item-${index}`}>
                <SkeletonPrimitive shape="avatar" width={28} height={28} />
                <SkeletonPrimitive width={`${72 - index * 6}%`} height={15} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SocialSkeleton({ section }: SectionSkeletonProps) {
  const count = configuredArrayCount(section, "links");
  return (
    <div
      className="section-skeleton section-skeleton--social"
      data-skeleton-kind="social"
      data-empty={count === 0 ? "true" : "false"}
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonPrimitive key={`social-${index}`} width={48} height={48} />
      ))}
    </div>
  );
}

function RichTextSkeleton() {
  return (
    <div className="section-skeleton section-skeleton--rich-text" data-skeleton-kind="rich-text">
      <SkeletonText lines={7} />
    </div>
  );
}

function CodeSkeleton() {
  return (
    <div className="section-skeleton section-skeleton--code" data-skeleton-kind="code">
      <div className="section-skeleton__code-header">
        <div className="section-skeleton__code-dots">
          <i />
          <i />
          <i />
        </div>
        <SkeletonPrimitive width={116} height={13} />
      </div>
      <div className="section-skeleton__code-body">
        {[58, 76, 43, 66, 51, 72, 38].map((width, index) => (
          <SkeletonPrimitive key={`code-line-${index}`} width={`${width}%`} height={12} />
        ))}
      </div>
    </div>
  );
}

function DataSkeleton() {
  return (
    <div className="section-skeleton section-skeleton--data" data-skeleton-kind="data">
      <div className="section-skeleton__data-title">
        <SkeletonPrimitive width="32%" height={26} />
        <SkeletonPrimitive width={96} height={36} />
      </div>
      <div className="section-skeleton__table">
        {Array.from({ length: 4 }, (_, row) => (
          <div className="section-skeleton__table-row" key={`row-${row}`}>
            <SkeletonPrimitive width="28%" height={14} />
            <SkeletonPrimitive width="20%" height={14} />
            <SkeletonPrimitive width="24%" height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

function InteractiveSkeleton({ section }: SectionSkeletonProps) {
  const count = Math.max(1, configuredCount(section));
  return (
    <div
      className="section-skeleton section-skeleton--interactive"
      data-skeleton-kind="interactive"
    >
      <div className="section-skeleton__interactive-title">
        <SkeletonPrimitive width="38%" height={24} />
        <SkeletonPrimitive width={72} height={26} />
      </div>
      <div className="section-skeleton__tabs">
        <SkeletonPrimitive width={92} height={34} />
        <SkeletonPrimitive width={92} height={34} />
      </div>
      <div className="section-skeleton__field-grid">
        {Array.from({ length: count }, (_, index) => (
          <div className="section-skeleton__field" key={`field-${index}`}>
            <SkeletonPrimitive width="35%" height={12} />
            <SkeletonPrimitive width="100%" height={38} />
          </div>
        ))}
      </div>
      <SkeletonPrimitive width={112} height={40} />
    </div>
  );
}

function UnsupportedSkeleton() {
  return (
    <div
      className="section-skeleton section-skeleton--unsupported"
      data-skeleton-kind="unsupported"
    >
      <Heading compact />
    </div>
  );
}

export function SectionSkeleton({ section }: SectionSkeletonProps) {
  let content: ReactNode;
  switch (section.section_type) {
    case "hero":
      content = <HeroSkeleton />;
      break;
    case "card_group":
      content = <CollectionSkeleton section={section} kind="card" />;
      break;
    case "stat_cards":
      content = <CollectionSkeleton section={section} kind="stat" />;
      break;
    case "feature_grid":
      content = <CollectionSkeleton section={section} kind="feature" />;
      break;
    case "event_highlights":
      content = <CollectionSkeleton section={section} kind="event" />;
      break;
    case "image_gallery":
      content = <GallerySkeleton section={section} />;
      break;
    case "cta":
      content = <CTASkeleton />;
      break;
    case "profile_card":
      content = <ProfileSkeleton section={section} />;
      break;
    case "social_links":
      content = <SocialSkeleton section={section} />;
      break;
    case "rich_text":
      content = <RichTextSkeleton />;
      break;
    case "code_editor":
      content = <CodeSkeleton />;
      break;
    case "data_sources":
    case "derived_section":
    case "custom_section":
      content = <DataSkeleton />;
      break;
    case "form":
    case "qa":
    case "survey":
    case "poll":
    case "vote":
      content = <InteractiveSkeleton section={section} />;
      break;
    default:
      content = <UnsupportedSkeleton />;
  }

  return (
    <div
      className={`section-skeleton-reserve section-skeleton-reserve--${section.section_type}`}
      style={
        section.section_type === "hero" || section.section_type === "social_links"
          ? undefined
          : { minHeight: sectionSkeletonHeight(section) }
      }
      aria-hidden="true"
    >
      {content}
    </div>
  );
}
