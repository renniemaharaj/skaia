export type SectionLayout = "center" | "left" | "right" | "wide";

function safeParseConfig(config: string): Record<string, any> {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

export function getSectionLayout(config: string): SectionLayout {
  const parsed = safeParseConfig(config);
  if (["left", "center", "right", "wide"].includes(parsed.layout)) {
    return parsed.layout;
  }
  if (parsed.wide) return "wide";
  return "center";
}

export function setSectionLayout(config: string, nextLayout: SectionLayout): string {
  const parsed = safeParseConfig(config);
  const updated = { ...parsed, layout: nextLayout };
  if ("wide" in updated) updated.wide = undefined;
  return JSON.stringify(updated);
}

// Margin helpers
export interface SectionMargins {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export interface BoxSpacingValues {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getSectionMargins(config: string): SectionMargins {
  const parsed = safeParseConfig(config);
  return {
    marginTop: parsed.marginTop ?? 0,
    marginRight: parsed.marginRight ?? 0,
    marginBottom: parsed.marginBottom ?? 0,
    marginLeft: parsed.marginLeft ?? 0,
    paddingTop: parsed.paddingTop ?? 0,
    paddingRight: parsed.paddingRight ?? 0,
    paddingBottom: parsed.paddingBottom ?? 0,
    paddingLeft: parsed.paddingLeft ?? 0,
  };
}

export function setSectionMargins(config: string, margins: Partial<SectionMargins>): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, ...margins });
}

// Animation helpers
export const SECTION_ANIMATIONS = [
  "none",
  "fade-in",
  "slide-up",
  "slide-left",
  "slide-right",
  "zoom-in",
  "bounce",
] as const;

export type SectionAnimation = (typeof SECTION_ANIMATIONS)[number];

export function getSectionAnimation(config: string): SectionAnimation {
  const parsed = safeParseConfig(config);
  if (SECTION_ANIMATIONS.includes(parsed.animation)) return parsed.animation;
  return "none";
}

export function setSectionAnimation(config: string, animation: SectionAnimation): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, animation });
}

// Animation intensity helpers
export const ANIMATION_INTENSITIES = ["subtle", "normal", "dramatic"] as const;
export type AnimationIntensity = (typeof ANIMATION_INTENSITIES)[number];

export function getSectionAnimationIntensity(config: string): AnimationIntensity {
  const parsed = safeParseConfig(config);
  if (ANIMATION_INTENSITIES.includes(parsed.animationIntensity)) return parsed.animationIntensity;
  return "normal";
}

export function setSectionAnimationIntensity(
  config: string,
  intensity: AnimationIntensity
): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, animationIntensity: intensity });
}

// Background color helpers
export function getSectionBgColor(config: string): string {
  const parsed = safeParseConfig(config);
  return parsed.bg_color ?? "";
}

export function setSectionBgColor(config: string, color: string): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, bg_color: color });
}
