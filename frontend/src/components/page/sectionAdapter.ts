import { DEFAULT_SECTION_SHELL, type ColorSource, type SharedSectionShell } from "./sectionRegistry";
import type { PageSectionConfig } from "./types";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
function decodeConfig(value: PageSectionConfig | undefined): Record<string, unknown> | null {
  if (typeof value !== "string") return value === undefined ? {} : objectValue(value);
  if (!value.trim()) return {};
  try { return objectValue(JSON.parse(value)); } catch { return null; }
}
function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
function color(value: unknown): ColorSource {
  if (typeof value === "string") return value ? {mode:"literal",value} : {mode:"inherit"};
  const source = objectValue(value);
  return source?.mode === "literal" && typeof source.value === "string" ? {mode:"literal",value:source.value} : {mode:"inherit"};
}

export function adaptLegacySectionShell(value: PageSectionConfig | undefined): SharedSectionShell {
  const config = decodeConfig(value);
  if (!config) return structuredClone(DEFAULT_SECTION_SHELL);
  const shell = structuredClone(DEFAULT_SECTION_SHELL);
  if (["left","center","right","wide"].includes(String(config.layout))) shell.layout = config.layout as SharedSectionShell["layout"];
  else if (config.wide) shell.layout = "wide";
  const width = config.container_width ?? config.containerWidth;
  if (["narrow","content","wide","full"].includes(String(width))) shell.container_width = width as SharedSectionShell["container_width"];
  for (const [canonical, legacy] of [["margin_top","marginTop"],["margin_right","marginRight"],["margin_bottom","marginBottom"],["margin_left","marginLeft"]] as const)
    shell[canonical] = bounded(config[canonical] ?? config[legacy], -512, 512, shell[canonical]);
  const unified = bounded(config.padding,0,512,0);
  for (const [canonical, legacy] of [["padding_top","paddingTop"],["padding_right","paddingRight"],["padding_bottom","paddingBottom"],["padding_left","paddingLeft"]] as const)
    shell[canonical] = bounded(config[canonical] ?? config[legacy],0,512,config.padding === undefined ? shell[canonical] : unified);
  if (["none","fade-in","slide-up","slide-left","slide-right","zoom-in","bounce"].includes(String(config.animation))) shell.animation = config.animation as SharedSectionShell["animation"];
  const intensity = config.animation_intensity ?? config.animationIntensity;
  if (["subtle","normal","dramatic"].includes(String(intensity))) shell.animation_intensity = intensity as SharedSectionShell["animation_intensity"];
  shell.background_color = color(config.background_color ?? config.bg_color); shell.text_color = color(config.text_color);
  shell.h1_color = color(config.h1_color); shell.h2_color = color(config.h2_color); shell.h3_color = color(config.h3_color);
  shell.content_scale = bounded(config.content_scale ?? config.contentScale,0.5,2,1);
  if (typeof config.collapsible === "boolean") shell.collapsible = config.collapsible;
  const collapsed = config.default_collapsed ?? config.defaultCollapsed; if (typeof collapsed === "boolean") shell.default_collapsed = collapsed;
  return shell;
}

export function projectSharedShellToLegacyConfig(value: PageSectionConfig | undefined, shell: SharedSectionShell): string {
  const config = decodeConfig(value) ?? {};
  const legacyColor = (source: ColorSource) => source.mode === "literal" ? source.value : "";
  return JSON.stringify({...config, layout:shell.layout, container_width:shell.container_width,
    marginTop:shell.margin_top,marginRight:shell.margin_right,marginBottom:shell.margin_bottom,marginLeft:shell.margin_left,
    paddingTop:shell.padding_top,paddingRight:shell.padding_right,paddingBottom:shell.padding_bottom,paddingLeft:shell.padding_left,
    animation:shell.animation,animationIntensity:shell.animation_intensity,background_color:shell.background_color,
    bg_color:legacyColor(shell.background_color),text_color:shell.text_color,h1_color:shell.h1_color,h2_color:shell.h2_color,h3_color:shell.h3_color,
    content_scale:shell.content_scale,collapsible:shell.collapsible,default_collapsed:shell.default_collapsed});
}
