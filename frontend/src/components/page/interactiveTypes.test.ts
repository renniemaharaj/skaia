import { describe, expect, it } from "vitest";
import {
  clearInteractiveRecords,
  configForNewSection,
  defaultInteractiveConfig,
  interactiveResultEntries,
  interactiveResponseLimitReached,
  normalizeInteractiveAnswers,
  parseInteractiveConfig,
  sectionForClipboard,
  validateInteractiveValues,
} from "./interactiveTypes";

describe("interactive page section config", () => {
  it("provides usable defaults for every registered type", () => {
    for (const type of ["form", "qa", "survey", "poll", "vote"] as const) {
      const config = defaultInteractiveConfig(type);
      expect(config.fields.length).toBeGreaterThan(0);
      expect(config.records).toEqual([]);
    }
  });

  it("merges stored config with type defaults", () => {
    const config = parseInteractiveConfig('{"submit_label":"Send"}', "form");
    expect(config.submit_label).toBe("Send");
    expect(config.fields.length).toBeGreaterThan(0);
  });

  it("persists interactive defaults when a new section is inserted", () => {
    const config = JSON.parse(configForNewSection("poll"));
    expect(config.fields).toHaveLength(1);
    expect(config.result_visibility).toBe("after_participation");
  });

  it("removes submitted records when a section is copied", () => {
    const config = JSON.parse(clearInteractiveRecords('{"records":[{"id":"r1"}],"status":"open"}'));
    expect(config.records).toEqual([]);
    expect(config.status).toBe("open");
  });

  it("removes records before clipboard serialization and fails closed on malformed config", () => {
    const section = sectionForClipboard({
      id: 1,
      display_order: 1,
      section_type: "form",
      heading: "Form",
      subheading: "",
      config: '{"records":[{"id":"r1","answers":{"secret":"value"}}]}',
    });
    expect(section.config).not.toContain("secret");
    expect(clearInteractiveRecords("not-json")).toBe('{"records":[]}');
  });

  it("normalizes numeric controls and omits empty optional answers", () => {
    const answers = normalizeInteractiveAnswers(
      [
        { key: "score", type: "rating", label: "Score" },
        { key: "comment", type: "textarea", label: "Comment" },
      ],
      { score: "4", comment: "" }
    );
    expect(answers).toEqual({ score: 4 });
  });

  it("provides labels for boolean and ordered numeric result variants", () => {
    expect(
      interactiveResultEntries(
        { key: "consent", type: "consent", label: "Consent" },
        { true: 2, false: 1 }
      )
    ).toEqual([
      ["true", "Yes"],
      ["false", "No"],
    ]);
    expect(
      interactiveResultEntries(
        { key: "score", type: "nps", label: "Score" },
        { "10": 1, "2": 1 }
      ).map(([value]) => value)
    ).toEqual(["2", "10"]);
  });

  it("applies configured limits to every participant section type", () => {
    expect(interactiveResponseLimitReached("form", 2, 2)).toBe(true);
    expect(interactiveResponseLimitReached("qa", 1, 1)).toBe(true);
    expect(interactiveResponseLimitReached("survey", 1, 1)).toBe(true);
    expect(interactiveResponseLimitReached("poll", 0, 1)).toBe(true);
    expect(interactiveResponseLimitReached("form", 0, 99)).toBe(false);
  });

  it("validates required fields and email shape", () => {
    const fields = defaultInteractiveConfig("form").fields;
    const errors = validateInteractiveValues(fields, { name: "", email: "bad", message: "" });
    expect(errors.name).toBeTruthy();
    expect(errors.email).toContain("valid email");
    expect(errors.message).toBeTruthy();
  });
});
