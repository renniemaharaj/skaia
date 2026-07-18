import type { PageTheme, SharedSectionShell } from "./types";

type ColorSource = SharedSectionShell["background_color"];

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const functionColor = /^(?:rgb|rgba|hsl|hsla)\([0-9.%+,\s-]+\)$/i;
const paletteKey = /^[a-z][a-z0-9_-]{0,63}$/;

export function isSafeSectionColor(value: string): boolean {
  return (
    value.trim() === value &&
    (hexColor.test(value) ||
      functionColor.test(value) ||
      ["black", "white", "transparent", "currentcolor"].includes(value.toLowerCase()))
  );
}

export function resolveSectionColor(source: ColorSource, theme: PageTheme): string | undefined {
  if (source.mode === "inherit") return undefined;
  if (source.mode === "literal") {
    return isSafeSectionColor(source.value) ? source.value : undefined;
  }
  if (!paletteKey.test(source.token)) return undefined;
  const token = theme.tokens.find(candidate => candidate.key === source.token);
  if (!token || !isSafeSectionColor(token.value)) return undefined;
  return `var(--skaia-page-color-${source.token})`;
}

export function pageThemeVariables(theme: PageTheme): Record<string, string> {
  return Object.fromEntries(
    theme.tokens
      .filter(token => paletteKey.test(token.key) && isSafeSectionColor(token.value))
      .map(token => [`--skaia-page-color-${token.key}`, token.value])
  );
}
