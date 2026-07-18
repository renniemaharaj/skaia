import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BLOCK_RENDERER_TYPES, BlockRenderer } from "./BlockRenderer";
import { SECTION_RENDERER_REGISTRY } from "./sectionRendererRegistry";
import {
  SECTION_CAPABILITIES,
  SECTION_CONFIG_VERSIONS,
  SECTION_DEFAULT_CONFIGS,
  SECTION_TYPES,
  type PageSection,
} from "./types";

const callbacks = () => ({
  onUpdateSection: vi.fn(),
  onDeleteSection: vi.fn(),
  onCreateSection: vi.fn(),
  onCreateItem: vi.fn(),
  onUpdateItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onMoveSection: vi.fn(),
});

const unsupportedSection: PageSection = {
  id: 1,
  display_order: 1,
  section_type: "mystery",
  heading: "Unknown",
  subheading: "",
  config: "{}",
  items: [],
};

describe("BlockRenderer registry contract", () => {
  it("dispatches every canonical section type exactly once", () => {
    expect(BLOCK_RENDERER_TYPES).toEqual([...SECTION_TYPES].sort());
    for (const type of SECTION_TYPES) {
      expect(SECTION_RENDERER_REGISTRY[type]).toMatchObject({
        configVersion: SECTION_CONFIG_VERSIONS[type],
        defaultConfig: SECTION_DEFAULT_CONFIGS[type],
        capabilities: SECTION_CAPABILITIES[type],
      });
    }
  });

  it("shows a safe visible fallback for an unknown viewer section", () => {
    render(<BlockRenderer sections={[unsupportedSection]} canEdit={false} {...callbacks()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported section");
    expect(screen.getByRole("alert")).toHaveTextContent("mystery");
    expect(screen.queryByRole("button", { name: "Remove section" })).not.toBeInTheDocument();
  });

  it("lets an editor remove an unknown section without exposing its config", () => {
    const handlers = callbacks();
    render(<BlockRenderer sections={[unsupportedSection]} canEdit {...handlers} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
    expect(handlers.onDeleteSection).toHaveBeenCalledWith(1);
    expect(screen.getByRole("alert")).not.toHaveTextContent(unsupportedSection.config);
  });
});
