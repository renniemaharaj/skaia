import { describe, expect, it } from "vitest";
import { typedLegacyKey, typedSectionMap, typedSectionPayload } from "./typedSectionApi";
import type { PageSection } from "./types";

describe("typed section API adapter", () => {
  it("keeps numeric and string legacy identities distinct", () => {
    const states = typedSectionMap([
      { id: 1, legacy_key: 7, revision: 2, display_order: 1 },
      { id: 2, legacy_key: "7", revision: 3, display_order: 2 },
    ]);
    expect(states.get(typedLegacyKey(7))?.id).toBe(1);
    expect(states.get(typedLegacyKey("7"))?.id).toBe(2);
  });

  it("separates interactive runtime records from typed mutation config", () => {
    const section: PageSection = {
      id: 9,
      display_order: 1,
      section_type: "poll",
      heading: "Poll",
      subheading: "",
      config: JSON.stringify({
        status: "open",
        submit_label: "Vote",
        success_text: "Done",
        result_visibility: "never",
        response_limit: 1,
        fields: [],
        records: [{ id: "private", answers: { choice: "secret" } }],
        result_summary: { total: 1 },
      }),
      items: [],
      revision: 4,
    };
    const payload = typedSectionPayload(section);
    expect(payload.section_type).toBe("poll");
    expect(payload.config).not.toHaveProperty("records");
    expect(payload.config).not.toHaveProperty("result_summary");
  });
});
