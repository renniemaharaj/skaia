import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionPicker } from "./SectionPicker";
import {
  SECTION_TYPE_DESCRIPTIONS,
  SECTION_TYPE_GROUPS,
  SECTION_TYPES,
  type SectionType,
} from "./types";

describe("SectionPicker", () => {
  it("has complete category and type metadata for the registry", () => {
    expect(SECTION_TYPE_GROUPS.every(group => group.description.trim().length > 0)).toBe(true);
    expect(SECTION_TYPE_GROUPS.flatMap(group => group.types).sort()).toEqual(
      [...SECTION_TYPES].sort()
    );
    for (const type of SECTION_TYPES) {
      expect(SECTION_TYPE_DESCRIPTIONS[type].trim().length).toBeGreaterThan(0);
    }
  });

  it("opens as an accessible searchable dialog and finds sections by description", () => {
    const onSelect = vi.fn<(type: SectionType) => void>();
    render(<SectionPicker onClose={() => {}} onSelect={onSelect} />);

    expect(screen.getByRole("dialog", { name: "Add section" })).toHaveAttribute(
      "aria-modal",
      "true"
    );
    expect(screen.getByRole("searchbox", { name: "Search sections" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Featured sections" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Lead with high-impact messages, people, and moments.")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sections" }), {
      target: { value: "confirmed ballots" },
    });
    expect(screen.getByRole("button", { name: "Interactive" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Voting" }));
    expect(onSelect).toHaveBeenCalledWith("vote");
  });

  it("supports compact view, empty search feedback, and Escape dismissal", () => {
    const onClose = vi.fn();
    render(<SectionPicker onClose={onClose} onSelect={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      document.querySelectorAll(".pb-section-picker__grid .pb-section-picker__item")
    ).toHaveLength(SECTION_TYPES.length);
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sections" }), {
      target: { value: "not a real section type" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("No sections found");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
