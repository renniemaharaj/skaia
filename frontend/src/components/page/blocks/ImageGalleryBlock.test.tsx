import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageGalleryBlock } from "./ImageGalleryBlock";

describe("ImageGalleryBlock", () => {
  it("opens a gallery image in the shared lightbox", () => {
    render(
      <ImageGalleryBlock
        section={{
          id: 1,
          display_order: 1,
          section_type: "image_gallery",
          heading: "Gallery",
          subheading: "",
          config: "{}",
          items: [
            {
              id: 2,
              section_id: 1,
              display_order: 1,
              icon: "",
              heading: "Harbour at dusk",
              subheading: "",
              image_url: "/harbour.webp",
              link_url: "",
              config: "{}",
            },
          ],
        }}
        canEdit
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onItemCreate={vi.fn()}
        onItemUpdate={vi.fn()}
        onItemDelete={vi.fn()}
      />
    );

    const overlay = document.querySelector(".showcase-overlay.is-editable");
    expect(overlay).toBeInTheDocument();
    expect(overlay?.querySelector(".pb-edit-btn")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview Harbour at dusk" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close media preview" })).toBeInTheDocument();
  });
});
