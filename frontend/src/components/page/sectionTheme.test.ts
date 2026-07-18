import { describe, expect, it } from "vitest";
import { isSafeSectionColor, pageThemeVariables, resolveSectionColor } from "./sectionTheme";
import type { PageTheme } from "./types";

const theme: PageTheme = {
  version: 1,
  revision: 1,
  tokens: [
    { key: "brand", label: "Brand", value: "#123456", display_order: 0, revision: 1 },
    { key: "bad;key", label: "Bad", value: "url(javascript:1)", display_order: 1, revision: 1 },
  ],
};

describe("section theme resolution", () => {
  it("accepts the bounded backend color subset and rejects declaration injection", () => {
    expect(isSafeSectionColor("#abcdef")).toBe(true);
    expect(isSafeSectionColor("rgba(12, 34, 56, 0.5)")).toBe(true);
    expect(isSafeSectionColor("red; background:url(x)")).toBe(false);
    expect(isSafeSectionColor("var(--untrusted)")).toBe(false);
  });

  it("resolves only declared safe palette tokens through namespaced variables", () => {
    expect(resolveSectionColor({ mode: "palette", token: "brand" }, theme)).toBe(
      "var(--skaia-page-color-brand)"
    );
    expect(resolveSectionColor({ mode: "palette", token: "missing" }, theme)).toBeUndefined();
    expect(pageThemeVariables(theme)).toEqual({ "--skaia-page-color-brand": "#123456" });
  });
});
