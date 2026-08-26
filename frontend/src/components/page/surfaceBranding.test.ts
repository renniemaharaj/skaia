import { describe, expect, it } from "vitest";
import { defaultSettings } from "../ui/GravityParticles/engine";
import { SECTION_TYPE_DESCRIPTIONS, SECTION_TYPE_GROUPS } from "./types";

describe("Go Web Platform surface defaults", () => {
  it("uses GWP in platform-owned visible defaults", () => {
    expect(defaultSettings.rendererText).toBe("GWP");
    expect(SECTION_TYPE_DESCRIPTIONS.resource_embed).toContain("Go Web Platform");
    expect(SECTION_TYPE_GROUPS.find(group => group.id === "embeds")?.description).toContain(
      "Go Web Platform"
    );
  });
});
