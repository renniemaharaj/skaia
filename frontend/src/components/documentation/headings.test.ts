import { describe, expect, it } from "vitest";
import { indexDocumentHeadings } from "./headings";

describe("indexDocumentHeadings", () => {
  it("creates stable unique anchors while retaining safe authored ids", () => {
    const result = indexDocumentHeadings("<h2>Start Here</h2><h2>Start Here</h2><h3 id='safe-id'>Next</h3>");
    expect(result.headings.map(item => item.id)).toEqual(["start-here", "start-here-2", "safe-id"]);
    expect(result.html).toContain('id="start-here-2"');
  });
});
