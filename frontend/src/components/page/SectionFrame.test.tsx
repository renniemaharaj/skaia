import { act, fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.queryByText("Collapsible content")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Collapsible content").parentElement).not.toHaveAttribute("hidden");
    fireEvent.click(trigger);
    expect(screen.getByText("Collapsible content").parentElement).toHaveAttribute("hidden");
  });

  it("uses a generic viewer collapse label for legacy builder headings", () => {
    render(
      <SectionFrame
        section={{
          ...section,
          heading: "Rich Text",
          config: JSON.stringify({ collapsible: true, default_collapsed: true }),
        }}
        isFirst
        isLast
        canEdit={false}
        onMove={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      >
        <div>Legacy section content</div>
      </SectionFrame>
    );

    expect(screen.getByRole("button", { name: "Expand section" })).toBeInTheDocument();
    expect(screen.queryByText("Expand Rich Text")).not.toBeInTheDocument();
  });

  it("defers child mounting against a supplied preview root while keeping the shell", () => {
    let callback: IntersectionObserverCallback | undefined;
    const previewRoot = document.createElement("div");
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(next: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          callback = next;
          expect(options?.root).toBe(previewRoot);
          expect(options?.rootMargin).toBe("0px");
        }
        observe() {}
        disconnect() {}
      }
    );
    const plainSection = { ...section, config: "{}" };
    const { container } = render(
      <SectionFrame
        section={plainSection}
        isFirst={false}
        isLast
        canEdit={false}
        onMove={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        eager={false}
        preview
        viewportRoot={previewRoot}
        fallback={<div>Rich text skeleton</div>}
      >
        <div>Deferred rich editor</div>
      </SectionFrame>
    );

    expect(container.querySelector(".pb-section-layout")).toHaveAttribute(
      "data-render-state",
      "deferred"
    );
    expect(screen.getByText("Rich text skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Deferred rich editor")).not.toBeInTheDocument();
    const target = container.querySelector(".pb-section-layout")!;
    act(() =>
      callback?.(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(screen.getByText("Deferred rich editor")).toBeInTheDocument();
  });

  it("activates editor content on intent and keeps it mounted across movement", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    const plainSection = { ...section, config: "{}" };
    const props = {
      section: plainSection,
      isFirst: false,
      isLast: true,
      canEdit: true,
      onMove: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      eager: false,
      fallback: <div>Editor skeleton</div>,
    };
    const { container, rerender } = render(
      <SectionFrame {...props}>
        <input aria-label="Section draft" defaultValue="retained" />
      </SectionFrame>
    );
    expect(screen.queryByLabelText("Section draft")).not.toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector(".pb-section-layout")!);
    const draft = screen.getByLabelText("Section draft") as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "unsaved" } });
    rerender(
      <SectionFrame {...props} isFirst isLast={false}>
        <input aria-label="Section draft" defaultValue="retained" />
      </SectionFrame>
    );
    expect(screen.getByLabelText("Section draft")).toHaveValue("unsaved");
  });
});
