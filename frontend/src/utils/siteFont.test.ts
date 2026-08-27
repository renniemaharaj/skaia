import { describe, expect, it } from "vitest";
import { googleFontStylesheetURL, normalizeSiteFontFamily, siteFontPreset } from "./siteFont";

describe("site font configuration", () => {
  it("normalizes safe Google Font family names", () => {
    expect(normalizeSiteFontFamily("  Playfair   Display ")).toBe("Playfair Display");
    expect(siteFontPreset("Inter")).toBe("Inter");
    expect(siteFontPreset("IBM Plex Sans")).toBe("custom");
  });

  it("rejects values that could escape the font-family declaration", () => {
    expect(normalizeSiteFontFamily('Inter"; color: red')).toBeNull();
    expect(normalizeSiteFontFamily("Inter, serif")).toBeNull();
    expect(googleFontStylesheetURL("Inter;display=swap")).toBeNull();
  });

  it("builds a bounded Google Fonts stylesheet URL", () => {
    expect(googleFontStylesheetURL("Open Sans")).toBe(
      "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap"
    );
    expect(googleFontStylesheetURL("")).toBeNull();
  });
});
