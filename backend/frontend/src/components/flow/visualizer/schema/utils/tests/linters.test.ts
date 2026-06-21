import { describe, it, expect } from "vitest";
import linterRegexSetup from "../linters";

type Case = {
  input: string;
  regex: RegExp;
};

const [atCommentRegex, singleLineCommentRegex, multiLineCommentRegex] =
  linterRegexSetup;

const cases: Case[] = [
  {
    input: "@ This is a comment",
    regex: atCommentRegex,
  },
  {
    input: "// This is a comment",
    regex: singleLineCommentRegex,
  },
  {
    input: "/* This is a comment */",
    regex: multiLineCommentRegex,
  },
  {
    input: `/*
        This is a multi-line comment
        */`,
    regex: multiLineCommentRegex,
  },
];
describe("Linter Regex Setup", () => {
  // Matching cases
  cases.forEach(({ input, regex }) => {
    it(`should match ${regex}`, () => {
      const match = input.match(regex);
      expect(match).toBeTruthy();
      if (match) expect(match[0]).toBe(input);
    });
  });

  // Non-matching cases
  it("should not match non-comment text", () => {
    const input = "This is not a comment";
    expect(input.match(atCommentRegex)).toBeNull();
    expect(input.match(singleLineCommentRegex)).toBeNull();
    expect(input.match(multiLineCommentRegex)).toBeNull();
  });
});
