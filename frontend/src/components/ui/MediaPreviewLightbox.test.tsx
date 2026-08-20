import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaPreviewLightbox } from "./MediaPreviewLightbox";

const items = [
  { url: "/uploads/first.webp", filename: "First image", type: "image" },
  { url: "/uploads/second.mp4", filename: "Second video", type: "video" },
];

describe("MediaPreviewLightbox", () => {
  it("uses the shared media lifecycle and preserves keyboard navigation", async () => {
    const onClose = vi.fn();
    const onIndexChange = vi.fn();
    render(
      <MediaPreviewLightbox
        items={items}
        index={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
      />
    );

    const dialog = screen.getByRole("dialog");
    const image = screen.getByRole("img", { name: "First image" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading First image");
    fireEvent.load(image);
    expect(image).toHaveClass("ready");
    expect(image.closest("figure")).toHaveAttribute("data-preserve-frame", "true");
    fireEvent.error(image);
    expect(screen.getByRole("alert")).toHaveTextContent("Asset failed to load");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close media preview" })).toHaveFocus()
    );
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("alert"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close media preview" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("passes video playback intent through the shared preview", () => {
    render(
      <MediaPreviewLightbox items={items} index={1} onClose={vi.fn()} onIndexChange={vi.fn()} />
    );

    const video = screen.getByLabelText("Second video");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
  });
});
