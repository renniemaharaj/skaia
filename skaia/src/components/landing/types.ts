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
}

export interface SEOConfig {
  title: string;
  description: string;
  og_image: string;
}

export interface FooterConfig {
  site_title: string;
  site_description: string;
  community_heading: string;
  community_items: string[];
  copyright_text: string;
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
};
