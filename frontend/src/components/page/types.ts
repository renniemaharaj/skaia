/** Types for the pages.content document and its renderer registry. */
import { SECTION_TYPES, type SectionType } from "./sectionRegistry";
export { DEFAULT_SECTION_SHELL, SECTION_TYPES } from "./sectionRegistry";
export type { ColorSource, SectionType, SharedSectionShell } from "./sectionRegistry";

// Existing documents contain both identity/config encodings. Keep this
// boundary deliberately permissive; individual renderers narrow what they use.
export type PageDocumentID = any;
export type PageSectionConfig = any;

export interface PageItem {
  id: PageDocumentID;
  section_id: PageDocumentID;
  display_order: number;
  icon: string;
  heading: string;
  subheading: string;
  image_url: string;
  link_url: string;
  config: PageSectionConfig;
}

export interface SectionEditor {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  edited_at?: string;
}

export interface PageSection {
  id: PageDocumentID;
  display_order: number;
  section_type: string;
  heading: string;
  subheading: string;
  config: PageSectionConfig;
  items?: PageItem[];
  last_edited_by?: SectionEditor;
  revision?: number;
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
  drawer_animation?: "scale" | "slide" | "fade";
  drawer_icon_size?: 32 | 40 | 48;
  drawer_columns?: 3 | 4 | 5;
  drawer_show_labels?: boolean;
  drawer_hidden_apps?: string[];
}
export interface SEOConfig {
  title: string;
  description: string;
  og_image: string;
  dom_skin: string;
  dom_video: string;
  particle_style: string;
  font_family?: string;
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

export const LEGACY_SECTION_TYPE_ALIASES = { features: "feature_grid" } as const satisfies Record<
  string,
  SectionType
>;
export function canonicalSectionType(type: string): SectionType | null {
  if ((SECTION_TYPES as readonly string[]).includes(type)) return type as SectionType;
  return LEGACY_SECTION_TYPE_ALIASES[type as keyof typeof LEGACY_SECTION_TYPE_ALIASES] ?? null;
}

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
  form: "Form",
  qa: "Questions & Answers",
  survey: "Survey",
  poll: "Poll",
  vote: "Voting",
  resource_embed: "Resource Embed",
};

export const SECTION_TYPE_DESCRIPTIONS: Record<SectionType, string> = {
  hero: "Introduce the page with a large visual banner.",
  card_group: "Arrange related content in a structured card grid.",
  stat_cards: "Highlight metrics with concise icon and text cards.",
  social_links: "Connect visitors to your social profiles.",
  image_gallery: "Present a collection of uploaded or linked images.",
  feature_grid: "Showcase features with icons, text, and links.",
  cta: "Focus attention on one clear next action.",
  event_highlights: "Promote events, dates, and schedule highlights.",
  profile_card: "Introduce a person with a compact profile summary.",
  rich_text: "Publish formatted headings, copy, lists, and media.",
  code_editor: "Display and edit a formatted code snippet.",
  data_sources: "Manage data that can power reusable sections.",
  derived_section: "Render a section from a connected data source.",
  custom_section: "Reuse a saved, data-backed section design.",
  form: "Collect structured responses with a custom form.",
  qa: "Host moderated questions and answers.",
  survey: "Gather answers across multiple questions.",
  poll: "Run a quick audience poll and summarize results.",
  vote: "Collect confirmed ballots with controlled results.",
  resource_embed: "Reference an existing Go Web Platform resource without copying it.",
};

export function isGeneratedSectionHeading(
  section: Pick<PageSection, "heading" | "section_type">
): boolean {
  const canonicalType = canonicalSectionType(section.section_type);
  if (!canonicalType) return false;
  return section.heading.trim() === SECTION_TYPE_LABELS[canonicalType];
}

export interface SectionTypeGroup {
  id: string;
  label: string;
  description: string;
  types: SectionType[];
}
export const SECTION_TYPE_GROUPS: SectionTypeGroup[] = [
  {
    id: "featured",
    label: "Featured sections",
    description: "Lead with high-impact messages, people, and moments.",
    types: ["hero", "cta", "event_highlights", "profile_card"],
  },
  {
    id: "content",
    label: "Content sections",
    description: "Organize images, links, metrics, and repeatable content.",
    types: ["card_group", "stat_cards", "social_links", "image_gallery", "feature_grid"],
  },
  {
    id: "rich",
    label: "Rich content",
    description: "Publish formatted, code, and data-powered content.",
    types: ["rich_text", "code_editor", "data_sources", "derived_section", "custom_section"],
  },
  {
    id: "interactive",
    label: "Interactive",
    description: "Collect responses and invite audience participation.",
    types: ["form", "qa", "survey", "poll", "vote"],
  },
  {
    id: "embeds",
    label: "Resource embeds",
    description: "Place an existing Go Web Platform resource on this page.",
    types: ["resource_embed"],
  },
];

export interface DataSourceCreator {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}
export interface DataSource {
  id: number;
  name: string;
  description: string;
  code: string;
  files?: Record<string, string>;
  cache_ttl: number;
  created_by?: number;
  creator?: DataSourceCreator;
  created_at: string;
  updated_at: string;
}
export const PREVIEW_TYPES = ["cards", "stat_cards", "table"] as const;
export type PreviewType = (typeof PREVIEW_TYPES)[number];
export const PREVIEW_TYPE_LABELS: Record<PreviewType, string> = {
  cards: "Cards",
  stat_cards: "Stats",
  table: "Table",
};
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
export const MAPPABLE_FIELDS = ["heading", "subheading", "icon", "image_url", "link_url"] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];
export const MAPPABLE_FIELD_LABELS: Record<MappableField, string> = {
  heading: "Heading",
  subheading: "Subheading",
  icon: "Icon",
  image_url: "Image URL",
  link_url: "Link URL",
};
export type ColumnMap = Partial<Record<MappableField, string>>;
export type RowOverrides = Record<string, Partial<Record<MappableField, string>>>;
export type CardWidth = "narrow" | "regular" | "wide" | "halfway" | "full";
export type ZoneAlign = "left" | "center" | "right";
export type ZoneSize = "sm" | "md" | "lg";
export type ImagePosition = "top" | "bottom" | "background" | "none";
export type CardStyle =
  | "default"
  | "flat"
  | "elevated"
  | "outlined"
  | "glass"
  | "filled"
  | "minimal";
export type CardOverflow = "hidden" | "visible" | "auto";
export type CardContentAlign = "start" | "center" | "end" | "stretch";
export interface CardZone {
  field: MappableField;
  align: ZoneAlign;
  size: ZoneSize;
  visible: boolean;
}
export interface CardTemplate {
  cardWidth: CardWidth;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: string;
  zones: CardZone[];
  gap: number;
  gridGap: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  padding?: number;
  imagePosition: ImagePosition;
  imageHeight?: number;
  borderRadius: number;
  cardStyle: CardStyle;
  overflow: CardOverflow;
  contentAlign: CardContentAlign;
  customCss?: string;
  tableStriped?: boolean;
  tableHover?: boolean;
  tableBordered?: boolean;
  tableCompact?: boolean;
}
export const DEFAULT_CARD_ZONES: CardZone[] = [
  { field: "image_url", align: "center", size: "lg", visible: true },
  { field: "icon", align: "left", size: "md", visible: false },
  { field: "heading", align: "left", size: "md", visible: true },
  { field: "subheading", align: "left", size: "sm", visible: true },
  { field: "link_url", align: "left", size: "sm", visible: false },
];
export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  cardWidth: "regular",
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
export function migrateCardTemplate(template: Partial<CardTemplate>): CardTemplate {
  const base = { ...DEFAULT_CARD_TEMPLATE, ...template };
  if (
    template.padding !== undefined &&
    template.paddingTop === undefined &&
    template.paddingRight === undefined
  ) {
    base.paddingTop = template.padding;
    base.paddingRight = template.padding;
    base.paddingBottom = template.padding;
    base.paddingLeft = template.padding;
  }
  return base;
}
export interface FactTableConfig {
  datasource_id?: number;
  render_as?: RenderableSectionType;
  column_map?: ColumnMap;
  row_overrides?: RowOverrides;
  columns?: number;
  row_key_column?: string;
  card_template?: CardTemplate;
  component_type?: string;
  component_version?: number;
  bindings?: Record<string, string>;
  style_overrides?: Record<string, Record<string, string>>;
  component_group?: ComponentGroup;
  event_hooks?: EventHook[];
}
export interface SectionPreset {
  id: number;
  name: string;
  description: string;
  datasource_id: number;
  section_type: PreviewType;
  preset_type?: PreviewType;
  config: string;
  created_by?: number;
  creator?: DataSourceCreator;
  created_at: string;
  updated_at: string;
}
export type CustomSection = SectionPreset;
export const BIND_POINT_KINDS = [
  "text",
  "rich_text",
  "number",
  "boolean",
  "url",
  "media",
  "image",
  "video",
  "object",
  "array",
  "action",
  "any",
] as const;
export type BindPointKind = (typeof BIND_POINT_KINDS)[number];
export interface BindPoint {
  key: string;
  label: string;
  description: string;
  kind: BindPointKind;
  required: boolean;
  fallback?: unknown;
}
export interface ComponentDefinition {
  type: string;
  label: string;
  group: string;
  description: string;
  repeatable: boolean;
  props_schema: Record<string, unknown>;
  style_targets: string[];
  bind_points: BindPoint[];
  version: number;
}
export const COMPONENT_ICON_POSITIONS = ["top-left", "top-right", "left", "right"] as const;
export type ComponentIconPosition = (typeof COMPONENT_ICON_POSITIONS)[number];
export interface ComponentGroupItem {
  id: string;
  component_type: string;
  bindings: Record<string, string>;
  width: number;
  order: number;
  icon_position?: ComponentIconPosition;
  event_hooks?: EventHook[];
}
export interface ComponentGroup {
  items: ComponentGroupItem[];
  gap: number;
  max_width: number;
  wrapper?: CardTemplate;
}
export interface EventHook {
  event: ComponentEvent;
  code: string;
}
export const COMPONENT_EVENTS = [
  "onClick",
  "onDoubleClick",
  "onHover",
  "onMouseEnter",
  "onMouseLeave",
] as const;
export type ComponentEvent = (typeof COMPONENT_EVENTS)[number];
