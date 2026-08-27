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
  "form",
  "qa",
  "survey",
  "poll",
  "vote",
  "resource_embed",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export type ColorSource = { mode: "inherit" } | { mode: "literal"; value: string };
export interface SharedSectionShell {
  layout: "left" | "center" | "right" | "wide";
  container_width: "narrow" | "content" | "wide" | "full";
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  padding_top: number;
  padding_right: number;
  padding_bottom: number;
  padding_left: number;
  animation: "none" | "fade-in" | "slide-up" | "slide-left" | "slide-right" | "zoom-in" | "bounce";
  animation_intensity: "subtle" | "normal" | "dramatic";
  background_color: ColorSource;
  text_color: ColorSource;
  h1_color: ColorSource;
  h2_color: ColorSource;
  h3_color: ColorSource;
  content_scale: number;
  max_height: number | null;
  collapsible: boolean;
  default_collapsed: boolean;
}

export const DEFAULT_SECTION_SHELL: SharedSectionShell = {
  layout: "center",
  container_width: "content",
  margin_top: 0,
  margin_right: 0,
  margin_bottom: 0,
  margin_left: 0,
  padding_top: 0,
  padding_right: 0,
  padding_bottom: 0,
  padding_left: 0,
  animation: "none",
  animation_intensity: "normal",
  background_color: { mode: "inherit" },
  text_color: { mode: "inherit" },
  h1_color: { mode: "inherit" },
  h2_color: { mode: "inherit" },
  h3_color: { mode: "inherit" },
  content_scale: 1,
  max_height: null,
  collapsible: false,
  default_collapsed: false,
};
