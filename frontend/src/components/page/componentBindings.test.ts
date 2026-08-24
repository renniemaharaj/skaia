import { describe, expect, it } from "vitest";
import { inputTextBinding, inputTextValue, isInputTextBinding } from "./componentBindings";

describe("component input text bindings", () => {
  it("round-trips literal text", () => {
    const binding = inputTextBinding("Players online");

    expect(isInputTextBinding(binding)).toBe(true);
    expect(inputTextValue(binding)).toBe("Players online");
  });

  it("does not treat datasource columns as input text", () => {
    expect(isInputTextBinding("players_online")).toBe(false);
    expect(inputTextValue("players_online")).toBe("");
  });
});
