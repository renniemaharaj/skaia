import { describe, expect, it } from "vitest";
import { isPageDocument, parsePageDocument } from "./PageDocumentField";

describe("page document boundary", () => {
  it("accepts empty and populated page-builder arrays", () => {
    expect(isPageDocument("[]")).toBe(true);
    expect(parsePageDocument('[{"id":1,"section_type":"rich_text"}]')).toHaveLength(1);
  });

  it("keeps legacy rich text outside the page document renderer", () => {
    expect(isPageDocument("<p>Legacy publication</p>")).toBe(false);
    expect(parsePageDocument("<p>Legacy publication</p>")).toEqual([]);
  });
});
