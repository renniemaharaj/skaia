import type { LandingSection, LandingItem, SectionType } from "./types";
import { SECTION_TYPE_LABELS, SECTION_TYPES } from "./types";
import { HeroBlock } from "./blocks/HeroBlock";
import { CardGroupBlock } from "./blocks/CardGroupBlock";
import { StatCardsBlock } from "./blocks/StatCardsBlock";
import { SocialLinksBlock } from "./blocks/SocialLinksBlock";
import { ImageGalleryBlock } from "./blocks/ImageGalleryBlock";
import { FeatureGridBlock } from "./blocks/FeatureGridBlock";
import { CTABlock } from "./blocks/CTABlock";
import { EventHighlightsBlock } from "./blocks/EventHighlightsBlock";
import { ProfileCardBlock } from "./blocks/ProfileCardBlock";
import { RichTextBlock } from "./blocks/RichTextBlock";
import { CodeEditorBlock } from "./blocks/CodeEditorBlock";
import { DataSourcesBlock } from "./blocks/DataSourcesBlock";
import { DerivedSectionBlock } from "./blocks/DerivedSectionBlock";
import { CustomSectionBlock } from "./blocks/CustomSectionBlock";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import {
  getSectionLayout,
  getSectionMargins,
  getSectionAnimation,
  getSectionBgColor,
  SectionMoveContext,
} from "./EditControls";

interface BlockRendererProps {
  sections: LandingSection[];
  canEdit: boolean;
  onUpdateSection: (s: LandingSection) => void;
  onDeleteSection: (id: number) => void;
  onCreateSection: (s: Omit<LandingSection, "id">) => void;
  onCreateItem: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onUpdateItem: (item: LandingItem) => void;
  onDeleteItem: (id: number) => void;
  onMoveSection: (sourceSectionId: number, targetSectionId: number) => void;
}

/** Maps section_type → block component. */
const BLOCK_MAP: Record<
  string,
  React.FC<{
    section: LandingSection;
    canEdit: boolean;
    onUpdate: (s: LandingSection) => void;
    onDelete: (id: number) => void;
    onItemCreate: (sectionId: number, item: Omit<LandingItem, "id">) => void;
    onItemUpdate: (item: LandingItem) => void;
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

export const BlockRenderer = ({
  sections,
  canEdit,
  onUpdateSection,
  onDeleteSection,
  onCreateSection,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onMoveSection,
}: BlockRendererProps) => {
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

  const orderedSections = [...sections].sort(
    (a, b) => a.display_order - b.display_order,
  );

  const handleMove = useCallback(
    (sectionId: number, direction: "up" | "down") => {
      const idx = orderedSections.findIndex((s) => s.id === sectionId);
      const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= orderedSections.length) return;
      onMoveSection(sectionId, orderedSections[neighborIdx].id);
    },
    [orderedSections, onMoveSection],
  );

  const renderAddSectionTrigger = (insertIndex: number) => (
    <div className="landing-add-section" key={`add-section-${insertIndex}`}>
      <button
        className="landing-add-section-btn"
        onClick={() =>
          setActiveAddIndex((prev) =>
            prev === insertIndex ? null : insertIndex,
          )
        }
      >
        <Plus size={18} /> Add Section
      </button>

      {activeAddIndex === insertIndex && (
        <div className="landing-add-section-menu">
          {SECTION_TYPES.map((type: SectionType) => (
            <button
              key={type}
              className="landing-add-section-menu-item"
              onClick={() => addSection(type, insertIndex)}
            >
              {SECTION_TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {canEdit && renderAddSectionTrigger(0)}

      {orderedSections.map((section, i) => {
        const Block = BLOCK_MAP[section.section_type];
        if (!Block) return null;
        const layout = getSectionLayout(section.config);
        const margins = getSectionMargins(section.config);
        const animation = getSectionAnimation(section.config);
        const bgColor = getSectionBgColor(section.config);
        const isFirst = i === 0;
        const isLast = i === orderedSections.length - 1;

        const sectionStyle: React.CSSProperties = {
          ...(margins.marginTop ? { marginTop: `${margins.marginTop}px` } : {}),
          ...(margins.marginBottom
            ? { marginBottom: `${margins.marginBottom}px` }
            : {}),
          ...(margins.paddingLeft
            ? { paddingLeft: `${margins.paddingLeft}px` }
            : {}),
          ...(margins.paddingRight
            ? { paddingRight: `${margins.paddingRight}px` }
            : {}),
          ...(bgColor ? { backgroundColor: bgColor } : {}),
        };

        return (
          <SectionMoveContext.Provider
            key={section.id}
            value={{
              onMoveUp: () => handleMove(section.id, "up"),
              onMoveDown: () => handleMove(section.id, "down"),
              canMoveUp: !isFirst,
              canMoveDown: !isLast,
            }}
          >
            <div
              className={`landing-section-layout landing-section-layout-${layout}`}
              style={sectionStyle}
              data-animation={animation !== "none" ? animation : undefined}
            >
              <Block
                section={section}
                canEdit={canEdit}
                onUpdate={onUpdateSection}
                onDelete={onDeleteSection}
                onItemCreate={onCreateItem}
                onItemUpdate={onUpdateItem}
                onItemDelete={onDeleteItem}
              />
            </div>
            {canEdit && renderAddSectionTrigger(i + 1)}
          </SectionMoveContext.Provider>
        );
      })}
    </>
  );
};
