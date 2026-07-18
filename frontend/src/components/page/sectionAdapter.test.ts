import { describe, expect, it } from "vitest";
import { adaptLegacyPageSection, projectTypedSectionToLegacy } from "./sectionAdapter";

describe("typed page section compatibility adapter", () => {
  it("normalizes object config, string identities, and the features alias", () => {
    const result = adaptLegacyPageSection({
      id: "gs-features",
      display_order: 2,
      section_type: "features",
      heading: "Features",
      config: {},
      items: [
        {
          id: "gs-item",
          section_id: "gs-features",
          display_order: 1,
          heading: "Feature",
          config: {},
        },
      ],
    });

    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    expect(result.section).toMatchObject({
      id: null,
      legacy_key: "gs-features",
      section_type: "feature_grid",
      config_version: 1,
      revision: 1,
    });
    expect(result.section.items[0]).toMatchObject({ id: null, legacy_key: "gs-item" });
    expect(result.audit).toEqual({
      original_section_type: "features",
      aliases: ["features:feature_grid"],
    });
  });

  it("separates shell fields, migrates hero video_url, and quarantines unknown config", () => {
    const result = adaptLegacyPageSection({
      id: 41,
      display_order: 1,
      section_type: "hero",
      heading: "Hero",
      future_section_field: "preserve",
      config: JSON.stringify({
        wide: true,
        marginBottom: -48,
        padding: 12,
        animationIntensity: "dramatic",
        bg_color: "#123456",
        video_url: "/legacy.mp4",
        future_key: { keep: true },
      }),
    });

    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    expect(result.section.shell).toMatchObject({
      layout: "wide",
      margin_bottom: -48,
      padding_top: 12,
      padding_right: 12,
      padding_bottom: 12,
      padding_left: 12,
      animation_intensity: "dramatic",
      background_color: { mode: "literal", value: "#123456" },
    });
    if (result.section.section_type !== "hero") throw new Error("expected hero");
    expect(result.section.config.videos).toEqual(["/legacy.mp4"]);
    expect(result.section.quarantined_config).toEqual({
      video_url: "/legacy.mp4",
      future_key: { keep: true },
    });
    expect(result.quarantined_section).toEqual({ future_section_field: "preserve" });

    const projected = projectTypedSectionToLegacy(result);
    expect(projected.id).toBe(41);
    expect(projected.future_section_field).toBe("preserve");
    expect(JSON.parse(projected.config as string)).toMatchObject({
      videos: ["/legacy.mp4"],
      video_url: "/legacy.mp4",
      future_key: { keep: true },
      marginBottom: -48,
      bg_color: "#123456",
    });
  });

  it("keeps interactive runtime records outside canonical config", () => {
    const result = adaptLegacyPageSection({
      id: 9,
      section_type: "poll",
      config: JSON.stringify({
        status: "open",
        submit_label: "Vote",
        success_text: "Recorded",
        result_visibility: "after_participation",
        response_limit: 1,
        fields: [{ key: "choice", type: "radio", label: "Choose" }],
        records: [{ id: "private-record" }],
        result_summary: { total: 1 },
      }),
    });

    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    expect(result.runtime).toEqual({
      records: [{ id: "private-record" }],
      result_summary: { total: 1 },
    });
    expect(result.section.config).not.toHaveProperty("records");
    expect(result.section.config).not.toHaveProperty("result_summary");
    expect(JSON.parse(projectTypedSectionToLegacy(result).config as string)).toMatchObject({
      records: [{ id: "private-record" }],
      result_summary: { total: 1 },
    });
  });

  it("preserves palette color sources through the legacy reverse projection", () => {
    const result = adaptLegacyPageSection({
      id: 10,
      section_type: "cta",
      config: {
        text_color: { mode: "palette", token: "body" },
        h1_color: { mode: "palette", token: "heading" },
      },
    });

    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    const config = JSON.parse(projectTypedSectionToLegacy(result).config as string);
    expect(config.text_color).toEqual({ mode: "palette", token: "body" });
    expect(config.h1_color).toEqual({ mode: "palette", token: "heading" });
  });

  it("fails closed for unsupported types and malformed section or item config", () => {
    expect(adaptLegacyPageSection({ id: 1, section_type: "mystery", config: {} }).status).toBe(
      "unsupported"
    );
    expect(adaptLegacyPageSection({ id: 1, section_type: "hero", config: "{" })).toMatchObject({
      status: "invalid",
      reason: "config",
    });
    expect(
      adaptLegacyPageSection({
        id: 1,
        section_type: "hero",
        config: {},
        items: [{ id: 2, config: "{" }],
      })
    ).toMatchObject({ status: "invalid", reason: "item_config" });
  });
});
