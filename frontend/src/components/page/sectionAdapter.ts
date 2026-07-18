import {
  DEFAULT_SECTION_SHELL,
  SECTION_CONFIG_KEYS,
  SECTION_CONFIG_VERSIONS,
  SECTION_DEFAULT_CONFIGS,
  type SectionConfig,
  type SharedSectionShell,
} from "./sectionContracts.generated";
import {
  canonicalSectionType,
  type AnyTypedPageSection,
  type NormalizedPageItem,
  type PageSection,
} from "./types";

export interface LegacyPageItemInput {
  id: string | number;
  section_id?: string | number;
  display_order?: number;
  icon?: string;
  heading?: string;
  subheading?: string;
  image_url?: string;
  link_url?: string;
  config?: string | Record<string, unknown>;
}

export interface LegacyPageSectionInput {
  id: string | number;
  display_order?: number;
  section_type?: string;
  heading?: string;
  subheading?: string;
  config?: string | Record<string, unknown>;
  items?: LegacyPageItemInput[];
  [key: string]: unknown;
}

export interface SectionRuntimeProjection {
  records?: unknown[];
  result_summary?: unknown;
}

export interface AdaptedPageSection {
  status: "normalized";
  section: AnyTypedPageSection;
  runtime: SectionRuntimeProjection;
  quarantined_section: Record<string, unknown>;
  audit: {
    original_section_type: string;
    aliases: string[];
  };
}

export type SectionAdaptResult =
  | AdaptedPageSection
  | { status: "unsupported"; input: LegacyPageSectionInput }
  | { status: "invalid"; input: LegacyPageSectionInput; reason: "config" | "item_config" };

const shellKeys = new Set([
  "layout",
  "wide",
  "container_width",
  "containerWidth",
  "margin_top",
  "marginTop",
  "margin_right",
  "marginRight",
  "margin_bottom",
  "marginBottom",
  "margin_left",
  "marginLeft",
  "padding",
  "padding_top",
  "paddingTop",
  "padding_right",
  "paddingRight",
  "padding_bottom",
  "paddingBottom",
  "padding_left",
  "paddingLeft",
  "animation",
  "animation_intensity",
  "animationIntensity",
  "background_color",
  "bg_color",
  "text_color",
  "h1_color",
  "h2_color",
  "h3_color",
  "content_scale",
  "contentScale",
  "collapsible",
  "default_collapsed",
  "defaultCollapsed",
]);

const layouts = new Set(["left", "center", "right", "wide"]);
const containerWidths = new Set(["narrow", "content", "wide", "full"]);
const animations = new Set([
  "none",
  "fade-in",
  "slide-up",
  "slide-left",
  "slide-right",
  "zoom-in",
  "bounce",
]);
const animationIntensities = new Set(["subtle", "normal", "dramatic"]);
const knownSectionFields = new Set([
  "id",
  "display_order",
  "section_type",
  "heading",
  "subheading",
  "config",
  "items",
  "last_edited_by",
  "revision",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function decodeConfig(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    if (!value.trim()) return {};
    try {
      return objectValue(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value === undefined ? {} : objectValue(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function colorSource(
  value: unknown,
  fallback: SharedSectionShell["background_color"]
): SharedSectionShell["background_color"] {
  if (typeof value === "string") {
    return value ? { mode: "literal", value } : { mode: "inherit" };
  }
  const source = objectValue(value);
  if (source?.mode === "inherit") return { mode: "inherit" };
  if (source?.mode === "palette" && typeof source.token === "string") {
    return { mode: "palette", token: source.token };
  }
  if (source?.mode === "literal" && typeof source.value === "string") {
    return { mode: "literal", value: source.value };
  }
  return fallback;
}

function shellFromLegacy(config: Record<string, unknown>): SharedSectionShell {
  const shell = structuredClone(DEFAULT_SECTION_SHELL) as SharedSectionShell;
  const layout = config.layout;
  if (typeof layout === "string" && layouts.has(layout)) {
    shell.layout = layout as SharedSectionShell["layout"];
  } else if (config.wide) {
    shell.layout = "wide";
  }
  const containerWidth = config.container_width ?? config.containerWidth;
  if (typeof containerWidth === "string" && containerWidths.has(containerWidth)) {
    shell.container_width = containerWidth as SharedSectionShell["container_width"];
  }

  const marginFields = [
    ["margin_top", "marginTop"],
    ["margin_right", "marginRight"],
    ["margin_bottom", "marginBottom"],
    ["margin_left", "marginLeft"],
  ] as const;
  for (const [canonical, legacy] of marginFields) {
    shell[canonical] = boundedNumber(
      config[canonical] ?? config[legacy],
      -512,
      512,
      shell[canonical]
    );
  }
  const unifiedPadding = boundedNumber(config.padding, 0, 512, 0);
  const paddingFields = [
    ["padding_top", "paddingTop"],
    ["padding_right", "paddingRight"],
    ["padding_bottom", "paddingBottom"],
    ["padding_left", "paddingLeft"],
  ] as const;
  for (const [canonical, legacy] of paddingFields) {
    shell[canonical] = boundedNumber(
      config[canonical] ?? config[legacy],
      0,
      512,
      config.padding === undefined ? shell[canonical] : unifiedPadding
    );
  }

  if (typeof config.animation === "string" && animations.has(config.animation)) {
    shell.animation = config.animation as SharedSectionShell["animation"];
  }
  const intensity = config.animation_intensity ?? config.animationIntensity;
  if (typeof intensity === "string" && animationIntensities.has(intensity)) {
    shell.animation_intensity = intensity as SharedSectionShell["animation_intensity"];
  }
  shell.background_color = colorSource(
    config.background_color ?? config.bg_color,
    shell.background_color
  );
  shell.text_color = colorSource(config.text_color, shell.text_color);
  shell.h1_color = colorSource(config.h1_color, shell.h1_color);
  shell.h2_color = colorSource(config.h2_color, shell.h2_color);
  shell.h3_color = colorSource(config.h3_color, shell.h3_color);
  shell.content_scale = boundedNumber(
    config.content_scale ?? config.contentScale,
    0.5,
    2,
    shell.content_scale
  );
  if (typeof config.collapsible === "boolean") shell.collapsible = config.collapsible;
  const collapsed = config.default_collapsed ?? config.defaultCollapsed;
  if (typeof collapsed === "boolean") shell.default_collapsed = collapsed;
  return shell;
}

/** Read the generated shell shape without requiring a registered section type. */
export function adaptLegacySectionShell(
  value: string | Record<string, unknown> | undefined
): SharedSectionShell {
  const config = decodeConfig(value);
  return config ? shellFromLegacy(config) : structuredClone(DEFAULT_SECTION_SHELL);
}

/** Project a generated shell back into the current pages.content config envelope. */
export function projectSharedShellToLegacyConfig(
  value: string | Record<string, unknown> | undefined,
  shell: SharedSectionShell
): string {
  const config = decodeConfig(value) ?? {};
  return JSON.stringify({
    ...config,
    layout: shell.layout,
    container_width: shell.container_width,
    marginTop: shell.margin_top,
    marginRight: shell.margin_right,
    marginBottom: shell.margin_bottom,
    marginLeft: shell.margin_left,
    paddingTop: shell.padding_top,
    paddingRight: shell.padding_right,
    paddingBottom: shell.padding_bottom,
    paddingLeft: shell.padding_left,
    animation: shell.animation,
    animationIntensity: shell.animation_intensity,
    background_color: shell.background_color,
    bg_color: projectColor(shell.background_color),
    text_color: shell.text_color,
    h1_color: shell.h1_color,
    h2_color: shell.h2_color,
    h3_color: shell.h3_color,
    content_scale: shell.content_scale,
    collapsible: shell.collapsible,
    default_collapsed: shell.default_collapsed,
  });
}

function validShellValue(key: string, value: unknown): boolean {
  if (key === "wide") return true;
  if (key === "layout") return typeof value === "string" && layouts.has(value);
  if (key === "container_width" || key === "containerWidth") {
    return typeof value === "string" && containerWidths.has(value);
  }
  if (key.startsWith("margin")) {
    return typeof value === "number" && Number.isFinite(value) && value >= -512 && value <= 512;
  }
  if (key === "padding" || key.startsWith("padding")) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 512;
  }
  if (key === "animation") return typeof value === "string" && animations.has(value);
  if (key === "animation_intensity" || key === "animationIntensity") {
    return typeof value === "string" && animationIntensities.has(value);
  }
  if (key.endsWith("_color") || key === "bg_color") {
    if (typeof value === "string") return true;
    const source = objectValue(value);
    return (
      source?.mode === "inherit" ||
      (source?.mode === "palette" && typeof source.token === "string") ||
      (source?.mode === "literal" && typeof source.value === "string")
    );
  }
  if (key === "content_scale" || key === "contentScale") {
    return typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 2;
  }
  return typeof value === "boolean";
}

function normalizeItem(item: LegacyPageItemInput): NormalizedPageItem | null {
  const config = decodeConfig(item.config);
  if (config === null) return null;
  return {
    id: null,
    legacy_key: item.id,
    display_order: boundedNumber(item.display_order, 0, Number.MAX_SAFE_INTEGER, 0),
    icon: stringValue(item.icon),
    heading: stringValue(item.heading),
    subheading: stringValue(item.subheading),
    image_url: stringValue(item.image_url),
    link_url: stringValue(item.link_url),
    config_version: 1,
    config,
    revision: 1,
  };
}

export function adaptLegacyPageSection(input: LegacyPageSectionInput): SectionAdaptResult {
  const originalType = stringValue(input.section_type);
  const sectionType = canonicalSectionType(originalType);
  if (!sectionType) return { status: "unsupported", input };
  const legacyConfig = decodeConfig(input.config);
  if (legacyConfig === null) return { status: "invalid", input, reason: "config" };

  const aliases: string[] = originalType === sectionType ? [] : [`${originalType}:${sectionType}`];
  const configKeys = new Set<string>(SECTION_CONFIG_KEYS[sectionType]);
  const specificConfig = structuredClone(SECTION_DEFAULT_CONFIGS[sectionType]) as Record<
    string,
    unknown
  >;
  const quarantinedConfig: Record<string, unknown> = {};
  const runtime: SectionRuntimeProjection = {};
  for (const [key, value] of Object.entries(legacyConfig)) {
    if (configKeys.has(key)) specificConfig[key] = value;
    else if (key === "records" && Array.isArray(value)) runtime.records = value;
    else if (key === "result_summary") runtime.result_summary = value;
    else if (shellKeys.has(key)) {
      if (!validShellValue(key, value)) quarantinedConfig[key] = value;
    } else quarantinedConfig[key] = value;
  }

  if (sectionType === "hero" && typeof legacyConfig.video_url === "string") {
    if (!Array.isArray(specificConfig.videos) || specificConfig.videos.length === 0) {
      specificConfig.videos = [legacyConfig.video_url];
    }
    quarantinedConfig.video_url = legacyConfig.video_url;
    aliases.push("video_url:videos");
  }

  const items: NormalizedPageItem[] = [];
  for (const item of input.items ?? []) {
    const normalized = normalizeItem(item);
    if (!normalized) return { status: "invalid", input, reason: "item_config" };
    items.push(normalized);
  }

  const section = {
    id: null,
    legacy_key: input.id,
    display_order: boundedNumber(input.display_order, 0, Number.MAX_SAFE_INTEGER, 0),
    section_type: sectionType,
    heading: stringValue(input.heading),
    subheading: stringValue(input.subheading),
    shell_version: 1,
    shell: shellFromLegacy(legacyConfig),
    config_version: SECTION_CONFIG_VERSIONS[sectionType],
    config: specificConfig as SectionConfig<typeof sectionType>,
    items,
    revision: boundedNumber(input.revision, 1, Number.MAX_SAFE_INTEGER, 1),
    quarantined_config: quarantinedConfig,
  } as PageSection<typeof sectionType>;

  return {
    status: "normalized",
    section: section as AnyTypedPageSection,
    runtime,
    quarantined_section: Object.fromEntries(
      Object.entries(input).filter(([key]) => !knownSectionFields.has(key))
    ),
    audit: { original_section_type: originalType, aliases },
  };
}

function projectColor(source: SharedSectionShell["background_color"]): string {
  return source.mode === "literal" ? source.value : "";
}

export function projectTypedSectionToLegacy(adapted: AdaptedPageSection): LegacyPageSectionInput {
  const { section, runtime } = adapted;
  const config: Record<string, unknown> = {
    ...section.quarantined_config,
    ...section.config,
    layout: section.shell.layout,
    container_width: section.shell.container_width,
    marginTop: section.shell.margin_top,
    marginRight: section.shell.margin_right,
    marginBottom: section.shell.margin_bottom,
    marginLeft: section.shell.margin_left,
    paddingTop: section.shell.padding_top,
    paddingRight: section.shell.padding_right,
    paddingBottom: section.shell.padding_bottom,
    paddingLeft: section.shell.padding_left,
    animation: section.shell.animation,
    animationIntensity: section.shell.animation_intensity,
    background_color: section.shell.background_color,
    bg_color: projectColor(section.shell.background_color),
    text_color: section.shell.text_color,
    h1_color: section.shell.h1_color,
    h2_color: section.shell.h2_color,
    h3_color: section.shell.h3_color,
    content_scale: section.shell.content_scale,
    collapsible: section.shell.collapsible,
    default_collapsed: section.shell.default_collapsed,
    ...runtime,
  };
  return {
    ...adapted.quarantined_section,
    id: section.legacy_key,
    display_order: section.display_order,
    section_type: section.section_type,
    heading: section.heading,
    subheading: section.subheading,
    revision: section.revision,
    config: JSON.stringify(config),
    items: section.items.map(item => ({
      id: item.legacy_key ?? 0,
      section_id: section.legacy_key,
      display_order: item.display_order,
      icon: item.icon,
      heading: item.heading,
      subheading: item.subheading,
      image_url: item.image_url,
      link_url: item.link_url,
      config: JSON.stringify(item.config),
    })),
  };
}
