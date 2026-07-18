import { lazy, type ComponentType } from "react";
import { sectionForClipboard } from "./interactiveTypes";
import {
  SECTION_CAPABILITIES,
  SECTION_CONFIG_VERSIONS,
  SECTION_DEFAULT_CONFIGS,
  SECTION_TYPES,
  type PageItem,
  type PageSection,
  type SectionConfig,
  type SectionType,
} from "./types";

const CTABlock = lazy(() =>
  import("./blocks/CTABlock").then(module => ({ default: module.CTABlock }))
);
const CardGroupBlock = lazy(() =>
  import("./blocks/CardGroupBlock").then(module => ({ default: module.CardGroupBlock }))
);
const CustomSectionBlock = lazy(() =>
  import("./blocks/CustomSectionBlock").then(module => ({ default: module.CustomSectionBlock }))
);
const DataSourcesBlock = lazy(() =>
  import("./blocks/DataSourcesBlock").then(module => ({ default: module.DataSourcesBlock }))
);
const DerivedSectionBlock = lazy(() =>
  import("./blocks/DerivedSectionBlock").then(module => ({ default: module.DerivedSectionBlock }))
);
const EventHighlightsBlock = lazy(() =>
  import("./blocks/EventHighlightsBlock").then(module => ({ default: module.EventHighlightsBlock }))
);
const FeatureGridBlock = lazy(() =>
  import("./blocks/FeatureGridBlock").then(module => ({ default: module.FeatureGridBlock }))
);
const HeroBlock = lazy(() =>
  import("./blocks/HeroBlock").then(module => ({ default: module.HeroBlock }))
);
const ProfileCardBlock = lazy(() =>
  import("./blocks/ProfileCardBlock").then(module => ({ default: module.ProfileCardBlock }))
);
const RichTextBlock = lazy(() =>
  import("./blocks/RichTextBlock").then(module => ({ default: module.RichTextBlock }))
);
const SocialLinksBlock = lazy(() =>
  import("./blocks/SocialLinksBlock").then(module => ({ default: module.SocialLinksBlock }))
);
const StatCardsBlock = lazy(() =>
  import("./blocks/StatCardsBlock").then(module => ({ default: module.StatCardsBlock }))
);
const InteractiveSectionBlock = lazy(() =>
  import("./blocks/InteractiveSectionBlock").then(module => ({
    default: module.InteractiveSectionBlock,
  }))
);
const ImageGalleryBlock = lazy(() =>
  import("./blocks/ImageGalleryBlock").then(module => ({ default: module.ImageGalleryBlock }))
);
const CodeEditorBlock = lazy(() =>
  import("./blocks/CodeEditorBlock").then(module => ({ default: module.CodeEditorBlock }))
);

export type SectionBlockComponent = ComponentType<{
  section: PageSection;
  canEdit: boolean;
  onUpdate: (section: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
  onItemDelete: (id: number) => void;
}>;

const components = {
  hero: HeroBlock,
  card_group: CardGroupBlock,
  stat_cards: StatCardsBlock,
  social_links: SocialLinksBlock,
  image_gallery: ImageGalleryBlock,
  feature_grid: FeatureGridBlock,
  cta: CTABlock,
  event_highlights: EventHighlightsBlock,
  profile_card: ProfileCardBlock,
  rich_text: RichTextBlock,
  code_editor: CodeEditorBlock,
  data_sources: DataSourcesBlock,
  derived_section: DerivedSectionBlock,
  custom_section: CustomSectionBlock,
  form: InteractiveSectionBlock,
  qa: InteractiveSectionBlock,
  survey: InteractiveSectionBlock,
  poll: InteractiveSectionBlock,
  vote: InteractiveSectionBlock,
} satisfies Record<SectionType, SectionBlockComponent>;

export interface SectionRendererDefinition<T extends SectionType> {
  component: SectionBlockComponent;
  configVersion: (typeof SECTION_CONFIG_VERSIONS)[T];
  defaultConfig: SectionConfig<T>;
  capabilities: (typeof SECTION_CAPABILITIES)[T];
  sanitizeForClipboard: (section: PageSection) => PageSection;
}

export type SectionRendererRegistry = {
  [T in SectionType]: SectionRendererDefinition<T>;
};

function definition<T extends SectionType>(type: T) {
  return {
    component: components[type],
    configVersion: SECTION_CONFIG_VERSIONS[type],
    defaultConfig: SECTION_DEFAULT_CONFIGS[type],
    capabilities: SECTION_CAPABILITIES[type],
    sanitizeForClipboard: sectionForClipboard,
  };
}

export const SECTION_RENDERER_REGISTRY = {
  hero: definition("hero"),
  card_group: definition("card_group"),
  stat_cards: definition("stat_cards"),
  social_links: definition("social_links"),
  image_gallery: definition("image_gallery"),
  feature_grid: definition("feature_grid"),
  cta: definition("cta"),
  event_highlights: definition("event_highlights"),
  profile_card: definition("profile_card"),
  rich_text: definition("rich_text"),
  code_editor: definition("code_editor"),
  data_sources: definition("data_sources"),
  derived_section: definition("derived_section"),
  custom_section: definition("custom_section"),
  form: definition("form"),
  qa: definition("qa"),
  survey: definition("survey"),
  poll: definition("poll"),
  vote: definition("vote"),
} satisfies SectionRendererRegistry;

export const SECTION_RENDERER_TYPES = Object.freeze([...SECTION_TYPES].sort());
