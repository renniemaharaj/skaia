import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProductMedia } from "../../atoms/store";
import { ProductMediaTable } from "./ProductMediaTable";

const media: ProductMedia[] = [
  {
    url: "/products/demo.mp4",
    filename: "Demo video",
    mime_type: "video/mp4",
    type: "video",
    size: 4096,
    created_at: "2026-08-16T12:00:00Z",
  },
];

describe("ProductMediaTable media", () => {
  it("keeps row preview and deletion functional after thumbnail failure", () => {
    const onChange = vi.fn();
    render(<ProductMediaTable media={media} editable onChange={onChange} />);

    const video = screen.getByLabelText("Demo video");
    const thumbnail = video.closest("figure");
    expect(thumbnail).toHaveClass("product-media-table__thumb");
    expect(thumbnail?.parentElement).toHaveClass("product-media-table__file");

    fireEvent.error(video);
    const failure = screen.getByRole("alert");
    expect(failure).toHaveTextContent("Demo video");
    fireEvent.click(failure);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close media preview" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove media" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
