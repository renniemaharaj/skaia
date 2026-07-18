import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SECTION_SHELL } from "./sectionContracts.generated";
import { getAnchoredPanelPosition, SectionShellControls } from "./SectionShellControls";
import { EMPTY_PAGE_THEME, type SharedSectionShell } from "./types";

function rect({
  top,
  right,
  bottom,
  left,
}: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): DOMRect {
  return {
    top,
    right,
    bottom,
    left,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

describe("SectionShellControls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flips above the anchor and clamps its horizontal position", () => {
    expect(
      getAnchoredPanelPosition(
        rect({ top: 700, right: 990, bottom: 730, left: 900 }),
        rect({ top: 0, right: 360, bottom: 400, left: 0 }),
        { width: 1000, height: 800 }
      )
    ).toEqual({ top: 292, left: 630, maxHeight: 684, placement: "top" });
  });

  it("portals the panel, positions it against the viewport, and restores focus on Escape", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.classList.contains("section-shell-controls-trigger")) {
        return rect({ top: 700, right: 990, bottom: 730, left: 900 });
      }
      if (this.classList.contains("section-shell-controls-panel")) {
        return rect({ top: 0, right: 360, bottom: 400, left: 0 });
      }
      return rect({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    render(
      <SectionShellControls
        shell={DEFAULT_SECTION_SHELL}
        theme={EMPTY_PAGE_THEME}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: "Appearance" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Section appearance" });

    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveAttribute("data-placement", "top");
    expect(panel).toHaveStyle({ top: "292px", left: "630px" });
    expect(panel.style.maxHeight).toBe("684px");
    expect(screen.getByLabelText("Section container width")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Section appearance" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses the shared precise color picker for literal section colors", () => {
    const onChange = vi.fn();
    const shell: SharedSectionShell = {
      ...DEFAULT_SECTION_SHELL,
      background_color: { mode: "literal", value: "#123456" },
    };
    render(<SectionShellControls shell={shell} theme={EMPTY_PAGE_THEME} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    const picker = screen.getByLabelText("Pick background color value");
    fireEvent.change(picker, { target: { value: "#abcdef" } });
    fireEvent.blur(picker);

    expect(onChange).toHaveBeenLastCalledWith({
      ...shell,
      background_color: { mode: "literal", value: "#abcdef" },
    });
  });
});
