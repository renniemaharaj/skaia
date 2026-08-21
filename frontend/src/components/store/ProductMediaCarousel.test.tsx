import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductMedia } from "../../atoms/store";
import { ProductMediaCarousel } from "./ProductMediaCarousel";

const media: ProductMedia[] = [
  {
    url: "/cover.webp",
    filename: "Cover",
    mime_type: "image/webp",
    type: "image",
    size: 10,
    created_at: "2026-08-21T00:00:00Z",
  },
  {
    url: "/demo.mp4",
    filename: "Demo",
    mime_type: "video/mp4",
    type: "video",
    size: 20,
    created_at: "2026-08-21T00:00:00Z",
  },
];

describe("ProductMediaCarousel", () => {
  it("cycles every product media item and opens the shared preview at the active item", () => {
    render(<ProductMediaCarousel media={media} alt="Platform" autoAdvance={false} />);

    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next media" }));
    expect(screen.getByText("2/2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview Demo" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close media preview" })).toBeInTheDocument();
  });
});
