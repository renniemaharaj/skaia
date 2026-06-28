import type { PageItem, PageSection, SectionType } from "./types";
import { SECTION_TYPE_GROUPS, SECTION_TYPE_LABELS } from "./types";
import "./page-builder-core.css";
import { Plus } from "lucide-react";
import React, {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SectionMoveContext,
  getSectionAnimation,
  getSectionAnimationIntensity,
  getSectionBgColor,
  getSectionLayout,
  getSectionMargins,
} from "./EditControls";
const CTABlock = lazy(() => import("./blocks/CTABlock").then(m => ({ default: m.CTABlock })));
const CardGroupBlock = lazy(() =>
  import("./blocks/CardGroupBlock").then(m => ({ default: m.CardGroupBlock }))
);
const CustomSectionBlock = lazy(() =>
  import("./blocks/CustomSectionBlock").then(m => ({ default: m.CustomSectionBlock }))
);
const DataSourcesBlock = lazy(() =>
  import("./blocks/DataSourcesBlock").then(m => ({ default: m.DataSourcesBlock }))
);
const DerivedSectionBlock = lazy(() =>
  import("./blocks/DerivedSectionBlock").then(m => ({ default: m.DerivedSectionBlock }))
);
const EventHighlightsBlock = lazy(() =>
  import("./blocks/EventHighlightsBlock").then(m => ({ default: m.EventHighlightsBlock }))
);
const FeatureGridBlock = lazy(() =>
  import("./blocks/FeatureGridBlock").then(m => ({ default: m.FeatureGridBlock }))
);
const HeroBlock = lazy(() => import("./blocks/HeroBlock").then(m => ({ default: m.HeroBlock })));
const ProfileCardBlock = lazy(() =>
  import("./blocks/ProfileCardBlock").then(m => ({ default: m.ProfileCardBlock }))
);
const RichTextBlock = lazy(() =>
  import("./blocks/RichTextBlock").then(m => ({ default: m.RichTextBlock }))
);
const SocialLinksBlock = lazy(() =>
  import("./blocks/SocialLinksBlock").then(m => ({ default: m.SocialLinksBlock }))
);
const StatCardsBlock = lazy(() =>
  import("./blocks/StatCardsBlock").then(m => ({ default: m.StatCardsBlock }))
);

// Heavy blocks — lazy-loaded so they don't bloat the initial bundle.
// Each will suspend (and show a skeleton fallback) only until its chunk lands.
const ImageGalleryBlock = lazy(() =>
  import("./blocks/ImageGalleryBlock").then(m => ({ default: m.ImageGalleryBlock }))
);
const CodeEditorBlock = lazy(() =>
  import("./blocks/CodeEditorBlock").then(m => ({ default: m.CodeEditorBlock }))
);

interface BlockRendererProps {
  sections: PageSection[];
  canEdit: boolean;
  onUpdateSection: (s: PageSection) => void;
  onDeleteSection: (id: number) => void;
  onCreateSection: (s: Omit<PageSection, "id">) => void;
  onCreateItem: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onUpdateItem: (item: PageItem) => void;
  onDeleteItem: (id: number) => void;
  onMoveSection: (sourceSectionId: number, targetSectionId: number) => void;
}

/** Maps section_type => block component. Typed as ComponentType so lazy()
 *  wrappers (which return LazyExoticComponent) are accepted without casting. */
const BLOCK_MAP: Record<
  string,
  React.ComponentType<{
    section: PageSection;
    canEdit: boolean;
    onUpdate: (s: PageSection) => void;
    onDelete: (id: number) => void;
    onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
    onItemUpdate: (item: PageItem) => void;
    onItemDelete: (id: number) => void;
  }>
> = {
  hero: HeroBlock as never,
  card_group: CardGroupBlock,
  stat_cards: StatCardsBlock,
  social_links: SocialLinksBlock as never,
  image_gallery: ImageGalleryBlock,
  feature_grid: FeatureGridBlock,
  cta: CTABlock as never,
  event_highlights: EventHighlightsBlock,
  profile_card: ProfileCardBlock as never,
  rich_text: RichTextBlock as never,
  code_editor: CodeEditorBlock as never,
  data_sources: DataSourcesBlock as never,
  derived_section: DerivedSectionBlock as never,
  custom_section: CustomSectionBlock as never,
};

/**
 * Memoised wrapper for a single section block.  When the parent re-renders
 * (e.g. a WS update changed a *different* section), this component will bail
 * out as long as its props still reference the same objects - which is
 * guaranteed by the `mergeSections` diffing in PageBuilder and the stable
 * `useCallback` wrappers.
 */
interface SectionBlockProps {
  section: PageSection;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (sectionId: number, direction: "up" | "down") => void;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
  onItemDelete: (id: number) => void;
}

/** Minimal skeleton shown while a heavy block chunk is fetching. */
const SectionBlockSkeleton = () => (
  <div
    className="skeleton"
    style={{ width: "100%", height: 80, borderRadius: 8, margin: "4px 0" }}
  />
);

const SectionBlock = memo(function SectionBlock({
  section,
  canEdit,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
  onItemCreate,
  onItemUpdate,
  onItemDelete,
}: SectionBlockProps) {
  const Block = BLOCK_MAP[section.section_type];
  if (!Block) return null;

  const layout = getSectionLayout(section.config);
  const margins = getSectionMargins(section.config);
  const animation = getSectionAnimation(section.config);
  const intensity = getSectionAnimationIntensity(section.config);
  const bgColor = getSectionBgColor(section.config);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(animation === "none");
  const [outView, setOutView] = useState(false);

  useEffect(() => {
    if (animation === "none") {
      setInView(true);
      setOutView(false);
      return;
    }
    const el = sectionRef.current;
    if (!el) return;
    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          setOutView(false);
        } else {
          setOutView(true);
          setInView(false);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animation]);

  const sectionStyle: React.CSSProperties = {
    ...(margins.marginTop ? { marginTop: `${margins.marginTop}px` } : {}),
    ...(margins.marginRight ? { marginRight: `${margins.marginRight}px` } : {}),
    ...(margins.marginBottom ? { marginBottom: `${margins.marginBottom}px` } : {}),
    ...(margins.marginLeft ? { marginLeft: `${margins.marginLeft}px` } : {}),
    ...(margins.paddingTop ? { paddingTop: `${margins.paddingTop}px` } : {}),
    ...(margins.paddingRight ? { paddingRight: `${margins.paddingRight}px` } : {}),
    ...(margins.paddingBottom ? { paddingBottom: `${margins.paddingBottom}px` } : {}),
    ...(margins.paddingLeft ? { paddingLeft: `${margins.paddingLeft}px` } : {}),
    ...(bgColor ? { backgroundColor: bgColor } : {}),
  };

  // Memoise the context value so SectionMoveButtons consumers don't re-render
  // unless the section's position actually changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const moveCtx = useMemo(
    () => ({
      onMoveUp: () => onMove(section.id, "up"),
      onMoveDown: () => onMove(section.id, "down"),
      canMoveUp: !isFirst,
      canMoveDown: !isLast,
      lastEditedBy: section.last_edited_by,
    }),
    [section.id, isFirst, isLast, onMove, section.last_edited_by]
  );

  return (
    <SectionMoveContext.Provider value={moveCtx}>
      <div
        ref={sectionRef}
        className={`pb-section-layout pb-section-layout-${layout}`}
        style={sectionStyle}
        data-animation={animation !== "none" ? animation : undefined}
        data-intensity={animation !== "none" ? intensity : undefined}
        data-in-view={inView ? "" : undefined}
        data-out-view={outView && !inView ? "" : undefined}
      >
        <Suspense fallback={<SectionBlockSkeleton />}>
          <Block
            section={section}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onItemCreate={onItemCreate}
            onItemUpdate={onItemUpdate}
            onItemDelete={onItemDelete}
          />
        </Suspense>
      </div>
    </SectionMoveContext.Provider>
  );
});

export const BlockRenderer = memo(function BlockRenderer({
  sections,
  canEdit,
  onUpdateSection,
  onDeleteSection,
  onCreateSection,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onMoveSection,
}: BlockRendererProps) {
  const [activeAddIndex, setActiveAddIndex] = useState<number | null>(null);

  const addSection = (type: SectionType, insertIndex: number) => {
    onCreateSection({
      display_order: insertIndex + 1,
      section_type: type,
      heading: SECTION_TYPE_LABELS[type] ?? type,
      subheading: "",
      config: "{}",
      items: [],
    });
    setActiveAddIndex(null);
  };

  const orderedSections = [...sections].sort((a, b) => a.display_order - b.display_order);

  // Stable move handler - uses refs so the callback identity never changes.
  const sectionsRef = useRef(orderedSections);
  sectionsRef.current = orderedSections;
  const onMoveSectionRef = useRef(onMoveSection);
  onMoveSectionRef.current = onMoveSection;

  const handleMove = useCallback((sectionId: number, direction: "up" | "down") => {
    const secs = sectionsRef.current;
    const idx = secs.findIndex(s => s.id === sectionId);
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= secs.length) return;
    onMoveSectionRef.current(sectionId, secs[neighborIdx].id);
  }, []);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const renderAddSectionTrigger = (insertIndex: number) => (
    <div className="pb-add-section" key={`add-section-${insertIndex}`}>
      <button
        className="pb-add-section-btn"
        onClick={() => setActiveAddIndex(prev => (prev === insertIndex ? null : insertIndex))}
      >
        <Plus size={18} /> Add Section
      </button>

      {activeAddIndex === insertIndex && (
        <div className="pb-add-section-menu">
          {SECTION_TYPE_GROUPS.map(group => (
            <div className="pb-add-section-group" key={group.id}>
              <button
                type="button"
                className="pb-add-section-group-header"
                onClick={() => toggleGroup(group.id)}
              >
                <div>
                  <div className="pb-add-section-group-label">{group.label}</div>
                  {group.description && (
                    <div className="pb-add-section-group-desc">{group.description}</div>
                  )}
                </div>
                <span className="pb-add-section-group-toggle">
                  {openGroups.has(group.id) ? "−" : "+"}
                </span>
              </button>

              {openGroups.has(group.id) && (
                <div className="pb-add-section-group-items">
                  {group.types.map(type => (
                    <button
                      key={type}
                      className="pb-add-section-menu-item"
                      onClick={() => addSection(type, insertIndex)}
                    >
                      {SECTION_TYPE_LABELS[type] ?? type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {canEdit && renderAddSectionTrigger(0)}

      {orderedSections.map((section, i) => {
        const isFirst = i === 0;
        const isLast = i === orderedSections.length - 1;

        return (
          <React.Fragment key={section.id}>
            <SectionBlock
              section={section}
              canEdit={canEdit}
              isFirst={isFirst}
              isLast={isLast}
              onMove={handleMove}
              onUpdate={onUpdateSection}
              onDelete={onDeleteSection}
              onItemCreate={onCreateItem}
              onItemUpdate={onUpdateItem}
              onItemDelete={onDeleteItem}
            />
            {canEdit && renderAddSectionTrigger(i + 1)}
          </React.Fragment>
        );
      })}
    </>
  );
});
