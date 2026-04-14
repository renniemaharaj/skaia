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

export interface LandingSection {
  id: number;
  display_order: number;
  section_type: string;
  heading: string;
  subheading: string;
  config: string;
  items?: LandingItem[];
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
};

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
