import { describe, expect, it } from "vitest";
import {
  clearInteractiveRecords,
  defaultInteractiveConfig,
  parseInteractiveConfig,
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

  it("removes submitted records when a section is copied", () => {
    const config = JSON.parse(clearInteractiveRecords('{"records":[{"id":"r1"}],"status":"open"}'));
    expect(config.records).toEqual([]);
    expect(config.status).toBe("open");
  });

  it("validates required fields and email shape", () => {
    const fields = defaultInteractiveConfig("form").fields;
    const errors = validateInteractiveValues(fields, { name: "", email: "bad", message: "" });
    expect(errors.name).toBeTruthy();
    expect(errors.email).toContain("valid email");
    expect(errors.message).toBeTruthy();
  });
});
