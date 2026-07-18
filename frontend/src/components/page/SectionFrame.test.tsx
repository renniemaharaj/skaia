import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SectionMoveButtons, SectionToolbarActions } from "./EditControls";
import { SectionFrame } from "./SectionFrame";
import type { PageSection } from "./types";

const section: PageSection = {
  id: 7,
  display_order: 1,
  section_type: "rich_text",
  heading: "Frame fixture",
  subheading: "",
  config: JSON.stringify({
    layout: "right",
    marginTop: 8,
    paddingLeft: 12,
    bg_color: "#123456",
    animation: "slide-up",
    animationIntensity: "dramatic",
  }),
  items: [],
};

describe("SectionFrame", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  it("preserves the existing layout, spacing, background, and animation DOM contract", () => {
    const { container } = render(
      <SectionFrame
        section={section}
        isFirst
        isLast={false}
        canEdit={false}
        onMove={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      >
        <div>Section content</div>
      </SectionFrame>
    );

    const frame = container.querySelector(".pb-section-layout-right");
    expect(frame).toHaveStyle({ marginTop: "8px", paddingLeft: "12px" });
    expect(frame).toHaveStyle({ backgroundColor: "rgb(18, 52, 86)" });
    expect(frame).toHaveAttribute("data-animation", "slide-up");
    expect(frame).toHaveAttribute("data-intensity", "dramatic");
    expect(screen.getByText("Section content")).toBeInTheDocument();
  });

  it("provides the existing movement context to block toolbars", () => {
    const onMove = vi.fn();
    render(
      <SectionFrame
        section={section}
        isFirst
        isLast={false}
        canEdit={false}
        onMove={onMove}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      >
        <SectionMoveButtons />
      </SectionFrame>
    );

    expect(screen.getByRole("button", { name: "Move section up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move section down" }));
    expect(onMove).toHaveBeenCalledWith(7, "down");
  });

  it("renders one shared toolbar and projects generated shell edits to legacy config", async () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <SectionFrame
        section={section}
        isFirst
        isLast
        canEdit
        onMove={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      >
        <SectionToolbarActions>
          <button type="button">Renderer action</button>
        </SectionToolbarActions>
      </SectionFrame>
    );

    expect(container.querySelectorAll(".pb-section-toolbar")).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "Renderer action" })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Align left"));

    expect(onUpdate).toHaveBeenCalledOnce();
    const updated = onUpdate.mock.calls[0][0] as PageSection;
    expect(JSON.parse(updated.config)).toMatchObject({
      layout: "left",
      container_width: "content",
      content_scale: 1,
      background_color: { mode: "literal", value: "#123456" },
    });
  });

  it("keeps viewer collapse state local and exposes an accessible trigger", () => {
    const collapsible = {
      ...section,
      config: JSON.stringify({ collapsible: true, default_collapsed: true }),
    };
    render(
      <SectionFrame
        section={collapsible}
        isFirst
        isLast
        canEdit={false}
        onMove={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        pageKey="fixture-page"
      >
        <div>Collapsible content</div>
      </SectionFrame>
    );

    const trigger = screen.getByRole("button", { name: "Expand Frame fixture" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Collapsible content").parentElement).toHaveAttribute("hidden");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Collapsible content").parentElement).not.toHaveAttribute("hidden");
  });
});
