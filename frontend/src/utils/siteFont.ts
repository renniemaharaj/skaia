export const SITE_FONT_PRESETS = [
  { value: "", label: "Platform default" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Poppins", label: "Poppins" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Playfair Display", label: "Playfair Display" },
] as const;

const GOOGLE_FONT_FAMILY = /^[A-Za-z](?:[A-Za-z0-9 -]{0,62}[A-Za-z0-9])?$/;

export function normalizeSiteFontFamily(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized) return "";
  return GOOGLE_FONT_FAMILY.test(normalized) ? normalized : null;
}

export function googleFontStylesheetURL(value: string | null | undefined): string | null {
  const family = normalizeSiteFontFamily(value);
  if (!family) return null;
  const queryFamily = family.split(" ").join("+");
  return `https://fonts.googleapis.com/css2?family=${queryFamily}:wght@400;500;600;700&display=swap`;
}

export function siteFontPreset(value: string | null | undefined): string {
  const family = normalizeSiteFontFamily(value);
  if (!family) return "";
  return SITE_FONT_PRESETS.some(option => option.value === family) ? family : "custom";
}
