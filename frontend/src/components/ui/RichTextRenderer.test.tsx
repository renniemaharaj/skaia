import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichTextRenderer } from "./RichTextRenderer";

describe("RichTextRenderer media", () => {
  it("sanitizes authored HTML and renders images through the shared media lifecycle", () => {
    const savedHtml =
      '<h2 id="saved-heading">Overview</h2><img src="/uploads/map.webp" alt="Route map" width="640" height="360" class="authored-image"><script>unsafe()</script>';

    const { container } = render(<RichTextRenderer html={savedHtml} previewMode />);
    const image = screen.getByRole("img", { name: "Route map" });
    const frame = image.closest("figure");

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).not.toHaveAttribute("id");
    expect(image).toHaveClass("authored-image");
    expect(frame).toHaveClass("rich-text-media-placeholder");
    expect(frame).toHaveStyle({ height: "360px", width: "640px" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading Route map");

    fireEvent.load(image);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(savedHtml).toContain('id="saved-heading"');
  });

  it("uses nested sources and captions for authored video without changing playback flags", () => {
    render(
      <RichTextRenderer html='<video controls autoplay muted playsinline poster="/poster.webp"><source src="/clip.webm"><track kind="captions" src="/clip.vtt"></video>' />
    );

    const video = screen.getByLabelText("Embedded video");
    expect(video).toHaveAttribute("src", "/clip.webm");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("poster", "/poster.webp");
    expect(video.querySelector("track")).toHaveAttribute("src", "/clip.vtt");
  });

  it("shows the editable shared empty state for media without a source", () => {
    render(<RichTextRenderer html='<audio title="Interview excerpt" controls></audio>' />);

    expect(screen.getByText("Placeholder for asset here")).toBeInTheDocument();
    expect(screen.getByText("Interview excerpt")).toBeInTheDocument();
  });

  it("preserves Tiptap image alignment and opens images in the shared lightbox", () => {
    render(
      <RichTextRenderer html='<div class="image" style="text-align: center"><img src="/flower.jpg" alt="Flower" width="240" align="center"></div>' />
    );

    const previewTrigger = screen.getByRole("button", { name: "Preview Flower" });
    expect(previewTrigger).toHaveStyle({ marginLeft: "auto", marginRight: "auto" });

    fireEvent.click(previewTrigger);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "Flower" })).toHaveAttribute(
      "src",
      "/flower.jpg"
    );
    expect(within(dialog).getByText("Flower")).toBeInTheDocument();
  });
});
