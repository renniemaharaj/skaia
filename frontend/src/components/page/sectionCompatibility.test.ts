import { describe, expect, it } from "vitest";
import {
  getSectionAnimation,
  getSectionAnimationIntensity,
  getSectionBgColor,
  getSectionLayout,
  getSectionMargins,
  setSectionLayout,
  setSectionMargins,
} from "./EditControls";
import {
  DEFAULT_CARD_TEMPLATE,
  LEGACY_SECTION_TYPE_ALIASES,
  SECTION_CAPABILITIES,
  SECTION_CONFIG_VERSIONS,
  SECTION_DEFAULT_CONFIGS,
  SECTION_TYPES,
  SECTION_TYPE_GROUPS,
  SECTION_TYPE_LABELS,
  canonicalSectionType,
  migrateCardTemplate,
} from "./types";

describe("legacy page section compatibility", () => {
  it("freezes the complete 19-type frontend registry", () => {
    expect(SECTION_TYPES).toHaveLength(19);
    expect(new Set(SECTION_TYPES).size).toBe(19);

    const grouped = SECTION_TYPE_GROUPS.flatMap(group => group.types);
    expect(new Set(grouped)).toEqual(new Set(SECTION_TYPES));
    for (const type of SECTION_TYPES) {
      expect(SECTION_TYPE_LABELS[type]).toBeTruthy();
      expect(SECTION_CONFIG_VERSIONS[type]).toBe(1);
      expect(SECTION_CAPABILITIES[type]).toContain("shared_shell");
      expect(SECTION_DEFAULT_CONFIGS[type]).toBeDefined();
    }
    expect(Object.keys(SECTION_DEFAULT_CONFIGS)).toEqual([...SECTION_TYPES]);
    expect(JSON.stringify(SECTION_DEFAULT_CONFIGS)).not.toContain('"records"');
  });

  it("maps only the known legacy section alias to a canonical type", () => {
    expect(LEGACY_SECTION_TYPE_ALIASES).toEqual({ features: "feature_grid" });
    expect(canonicalSectionType("features")).toBe("feature_grid");
    expect(canonicalSectionType("hero")).toBe("hero");
    expect(canonicalSectionType("mystery")).toBeNull();
  });

  it("reads legacy shell aliases, negative spacing, animation, and background", () => {
    const config = JSON.stringify({
      wide: true,
      marginBottom: -48,
      paddingTop: 8,
      animation: "slide-up",
      animationIntensity: "dramatic",
      bg_color: "#112233",
    });

    expect(getSectionLayout(config)).toBe("wide");
    expect(getSectionMargins(config)).toMatchObject({ marginBottom: -48, paddingTop: 8 });
    expect(getSectionAnimation(config)).toBe("slide-up");
    expect(getSectionAnimationIntensity(config)).toBe("dramatic");
    expect(getSectionBgColor(config)).toBe("#112233");
  });

  it("uses stable shell defaults for empty and malformed configs", () => {
    for (const config of ["", "not-json"]) {
      expect(getSectionLayout(config)).toBe("center");
      expect(getSectionMargins(config)).toEqual({
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      expect(getSectionAnimation(config)).toBe("none");
      expect(getSectionAnimationIntensity(config)).toBe("normal");
      expect(getSectionBgColor(config)).toBe("");
    }
  });

  it("replaces the wide alias without dropping unknown config fields", () => {
    const updated = JSON.parse(setSectionLayout('{"wide":true,"future_key":{"keep":1}}', "left"));
    expect(updated).toEqual({ layout: "left", future_key: { keep: 1 } });

    const spaced = JSON.parse(setSectionMargins(JSON.stringify(updated), { marginLeft: -12 }));
    expect(spaced).toEqual({
      layout: "left",
      future_key: { keep: 1 },
      marginLeft: -12,
    });
  });

  it("expands legacy unified card padding only when side values are absent", () => {
    const migrated = migrateCardTemplate({ padding: 12, zones: [] });
    expect(migrated).toMatchObject({
      paddingTop: 12,
      paddingRight: 12,
      paddingBottom: 12,
      paddingLeft: 12,
    });

    const explicit = migrateCardTemplate({
      ...DEFAULT_CARD_TEMPLATE,
      padding: 12,
      paddingTop: 3,
      paddingRight: 4,
      paddingBottom: 5,
      paddingLeft: 6,
    });
    expect(explicit).toMatchObject({
      paddingTop: 3,
      paddingRight: 4,
      paddingBottom: 5,
      paddingLeft: 6,
    });
  });
});
