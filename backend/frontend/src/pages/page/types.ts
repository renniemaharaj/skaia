/** Types for the landing page block system. */

export interface LandingItem {
  id: number;
  section_id: number;
  display_order: number;
  icon: string;
  heading: string;
  subheading: string;
  image_url: string;
  link_url: string;
  config: string;
}

export interface SectionEditor {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  edited_at?: string;
}

export interface LandingSection {
  id: number;
  display_order: number;
  section_type: string;
  heading: string;
  subheading: string;
  config: string;
  items?: LandingItem[];
  last_edited_by?: SectionEditor;
}

export interface Branding {
  site_name: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  header_title: string;
  header_subtitle: string;
  header_variant: number;
  menu_variant: number;
}

export interface SEOConfig {
  title: string;
  description: string;
  og_image: string;
}

export interface FooterLink {
  label: string;
  url: string;
}

export interface FooterSocialLink {
  icon: string;
  url: string;
}

export interface FooterConfig {
  variant: number;
  site_title: string;
  site_description: string;
  community_heading: string;
  community_items: string[];
  copyright_text: string;
  quick_links: FooterLink[];
  contact_heading: string;
  contact_text: string;
  tagline: string;
  social_links: FooterSocialLink[];
}

/** All section types the renderer knows about. */
export const SECTION_TYPES = [
  "hero",
  "card_group",
  "stat_cards",
  "social_links",
  "image_gallery",
  "feature_grid",
  "cta",
  "event_highlights",
  "profile_card",
  "rich_text",
  "code_editor",
  "data_sources",
  "derived_section",
  "custom_section",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_TYPE_LABELS: Record<string, string> = {
  hero: "Hero Banner",
  card_group: "Card Group",
  stat_cards: "Stat Cards (icon + text)",
  social_links: "Social Links",
  image_gallery: "Image Gallery",
  feature_grid: "Feature Grid (icon tiles)",
  cta: "Call to Action",
  event_highlights: "Event Highlights",
  profile_card: "Profile Card",
  rich_text: "Rich Text",
  code_editor: "Code Editor",
  data_sources: "Data Sources",
  derived_section: "Derived Section",
  custom_section: "Custom Section",
};

export interface SectionTypeGroup {
  id: string;
  label: string;
  description?: string;
  types: SectionType[];
}

export const SECTION_TYPE_GROUPS: SectionTypeGroup[] = [
  {
    id: "featured",
    label: "Featured blocks",
    description: "Large visual sections for your hero and highlights.",
    types: ["hero", "cta", "event_highlights", "profile_card"],
  },
  {
    id: "content",
    label: "Content blocks",
    description:
      "Cards, stats, galleries and social links for structured content.",
    types: [
      "card_group",
      "stat_cards",
      "social_links",
      "image_gallery",
      "feature_grid",
    ],
  },
  {
    id: "rich",
    label: "Rich content",
    description: "Text, code and custom sections for advanced content.",
    types: [
      "rich_text",
      "code_editor",
      "data_sources",
      "derived_section",
      "custom_section",
    ],
  },
];

/** Creator info returned with a data source. */
export interface DataSourceCreator {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

/** A data source stored in the backend. */
export interface DataSource {
  id: number;
  name: string;
  description: string;
  code: string;
  created_by?: number;
  creator?: DataSourceCreator;
  created_at: string;
  updated_at: string;
}

/** Preview / visualization types for data sources. */
export const PREVIEW_TYPES = ["cards", "stat_cards", "table"] as const;
export type PreviewType = (typeof PREVIEW_TYPES)[number];

export const PREVIEW_TYPE_LABELS: Record<PreviewType, string> = {
  cards: "Cards",
  stat_cards: "Stats",
  table: "Table",
};

/* ── Column-mapped (fact-table) rendering ─────────────────────────────── */

/** Section types that support datasource-driven rendering. */
export const RENDERABLE_SECTION_TYPES = [
  "card_group",
  "feature_grid",
  "stat_cards",
  "event_highlights",
  "image_cards",
  "designed_card",
] as const;
export type RenderableSectionType = (typeof RENDERABLE_SECTION_TYPES)[number];

export const RENDERABLE_TYPE_LABELS: Record<RenderableSectionType, string> = {
  card_group: "Card Group",
  feature_grid: "Feature Grid",
  stat_cards: "Stat Cards",
  event_highlights: "Event Highlights",
  image_cards: "Image Cards",
  designed_card: "Designed Card",
};

/** Fields on a LandingItem that a datasource column can be mapped to. */
export const MAPPABLE_FIELDS = [
  "heading",
  "subheading",
  "icon",
  "image_url",
  "link_url",
] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export const MAPPABLE_FIELD_LABELS: Record<MappableField, string> = {
  heading: "Heading",
  subheading: "Subheading",
  icon: "Icon",
  image_url: "Image URL",
  link_url: "Link URL",
};

/** Maps LandingItem field → datasource column name. */
export type ColumnMap = Partial<Record<MappableField, string>>;

/** Per-row overrides keyed by a stable row identifier. */
export type RowOverrides = Record<
  string,
  Partial<Record<MappableField, string>>
>;

/* ── Card Designer types ───────────────────────────────────────────────── */

/** Card width options for grid-based card layouts. */
export type CardWidth = "narrow" | "regular" | "wide" | "halfway" | "full";

/** Alignment options for card zones. */
export type ZoneAlign = "left" | "center" | "right";

/** Size presets for card zone content. */
export type ZoneSize = "sm" | "md" | "lg";

/** Where the image zone sits relative to the card body. */
export type ImagePosition = "top" | "bottom" | "background" | "none";

/** Card visual style presets. */
export type CardStyle =
  | "default"
  | "flat"
  | "elevated"
  | "outlined"
  | "glass"
  | "filled"
  | "minimal";

/** Overflow behavior for card content. */
export type CardOverflow = "hidden" | "visible" | "auto";

/** Content alignment within the card body. */
export type CardContentAlign = "start" | "center" | "end" | "stretch";

/**
 * A zone within a designed card. Each zone renders one MappableField
 * with configurable alignment and sizing.
 */
export interface CardZone {
  field: MappableField;
  align: ZoneAlign;
  size: ZoneSize;
  visible: boolean;
}

/**
 * Card template describing the visual layout of a designed card.
 * Stored in the section config JSON alongside FactTableConfig.
 */
export interface CardTemplate {
  cardWidth: CardWidth;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: string;
  zones: CardZone[];
  /** Inner gap between body zones (px). */
  gap: number;
  /** Grid gap between cards (px). */
  gridGap: number;
  /** Margin: outer spacing around the card or table in px. */
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  /** Padding: inner spacing inside the card or table wrapper in px. */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  /** Legacy unified padding — migrated to per-side on load. */
  padding?: number;
  imagePosition: ImagePosition;
  /** Image height in px — controls how much space the image claims. */
  imageHeight?: number;
  /** Border radius in px. */
  borderRadius: number;
  /** Card style preset. */
  cardStyle: CardStyle;
  /** Overflow behavior. */
  overflow: CardOverflow;
  /** Body content vertical alignment. */
  contentAlign: CardContentAlign;
  /** Optional custom CSS to apply to designed cards or tables. */
  customCss?: string;
  /** Table design options when rendering a table preview. */
  tableStriped?: boolean;
  tableHover?: boolean;
  tableBordered?: boolean;
  tableCompact?: boolean;
}

/** Default zone order for a new card template. */
export const DEFAULT_CARD_ZONES: CardZone[] = [
  { field: "image_url", align: "center", size: "lg", visible: true },
  { field: "icon", align: "left", size: "md", visible: false },
  { field: "heading", align: "left", size: "md", visible: true },
  { field: "subheading", align: "left", size: "sm", visible: true },
  { field: "link_url", align: "left", size: "sm", visible: false },
];

export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  cardWidth: "regular",
  minHeight: undefined,
  maxHeight: undefined,
  aspectRatio: "auto",
  zones: DEFAULT_CARD_ZONES,
  gap: 8,
  gridGap: 24,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  paddingTop: 0,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 16,
  imagePosition: "top",
  imageHeight: undefined,
  borderRadius: 16,
  cardStyle: "default",
  overflow: "hidden",
  contentAlign: "start",
  customCss: "",
  tableStriped: true,
  tableHover: true,
  tableBordered: false,
  tableCompact: false,
};

/** Migrate legacy template that only had a single `padding` field. */
export function migrateCardTemplate(t: Partial<CardTemplate>): CardTemplate {
  const base = { ...DEFAULT_CARD_TEMPLATE, ...t };
  // Migrate legacy single padding to per-side
  if (
    t.padding !== undefined &&
    t.paddingTop === undefined &&
    t.paddingRight === undefined
  ) {
    base.paddingTop = t.padding;
    base.paddingRight = t.padding;
    base.paddingBottom = t.padding;
    base.paddingLeft = t.padding;
  }
  // Ensure defaults for new fields
  if (base.gridGap === undefined) base.gridGap = 24;
  if (base.borderRadius === undefined) base.borderRadius = 16;
  if (base.cardStyle === undefined) base.cardStyle = "default";
  if (base.overflow === undefined) base.overflow = "hidden";
  if (base.contentAlign === undefined) base.contentAlign = "start";
  if (base.customCss === undefined) base.customCss = "";
  if (base.marginTop === undefined) base.marginTop = 0;
  if (base.marginRight === undefined) base.marginRight = 0;
  if (base.marginBottom === undefined) base.marginBottom = 0;
  if (base.marginLeft === undefined) base.marginLeft = 0;
  if (base.paddingTop === undefined) base.paddingTop = 0;
  if (base.paddingRight === undefined) base.paddingRight = 16;
  if (base.paddingBottom === undefined) base.paddingBottom = 16;
  if (base.paddingLeft === undefined) base.paddingLeft = 16;
  if (base.tableStriped === undefined) base.tableStriped = true;
  if (base.tableHover === undefined) base.tableHover = true;
  if (base.tableBordered === undefined) base.tableBordered = false;
  if (base.tableCompact === undefined) base.tableCompact = false;
  return base;
}

/** Configuration for a datasource-driven section. */
export interface FactTableConfig {
  datasource_id?: number;
  render_as?: RenderableSectionType;
  column_map?: ColumnMap;
  row_overrides?: RowOverrides;
  columns?: number;
  row_key_column?: string; // which datasource column provides the stable row key
  card_template?: CardTemplate;
}

/** A saved custom section (reusable data-bound visualization). */
export interface CustomSection {
  id: number;
  name: string;
  description: string;
  datasource_id: number;
  section_type: PreviewType;
  config: string;
  created_by?: number;
  creator?: DataSourceCreator;
  created_at: string;
  updated_at: string;
}
