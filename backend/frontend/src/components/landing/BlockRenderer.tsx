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
import { Plus } from "lucide-react";
import { useState } from "react";

interface BlockRendererProps {
  sections: LandingSection[];
  canEdit: boolean;
  onUpdateSection: (s: LandingSection) => void;
  onDeleteSection: (id: number) => void;
  onCreateSection: (s: Omit<LandingSection, "id">) => void;
  onCreateItem: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onUpdateItem: (item: LandingItem) => void;
  onDeleteItem: (id: number) => void;
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
}: BlockRendererProps) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <>
      {sections
        .sort((a, b) => a.display_order - b.display_order)
        .map((section) => {
          const Block = BLOCK_MAP[section.section_type];
          if (!Block) return null;
          return (
            <Block
              key={section.id}
              section={section}
              canEdit={canEdit}
              onUpdate={onUpdateSection}
              onDelete={onDeleteSection}
              onItemCreate={onCreateItem}
              onItemUpdate={onUpdateItem}
              onItemDelete={onDeleteItem}
            />
          );
        })}

      {canEdit && (
        <div className="landing-add-section">
          <button
            className="landing-add-section-btn"
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Plus size={18} /> Add Section
          </button>
          {showAddMenu && (
            <div className="landing-add-section-menu">
              {SECTION_TYPES.map((type: SectionType) => (
                <button
                  key={type}
                  className="landing-add-section-menu-item"
                  onClick={() => {
                    onCreateSection({
                      display_order: sections.length + 1,
                      section_type: type,
                      heading: SECTION_TYPE_LABELS[type] ?? type,
                      subheading: "",
                      config: "{}",
                      items: [],
                    });
                    setShowAddMenu(false);
                  }}
                >
                  {SECTION_TYPE_LABELS[type] ?? type}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};
