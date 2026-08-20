import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichTextRenderer } from "./RichTextRenderer";

describe("RichTextRenderer", () => {
  it("keeps literal and empty paragraph line breaks for prose and poetry", () => {
    const { container } = render(
      <RichTextRenderer
        html={'<p>First line\nSecond line</p><p style="line-height: 2.25"></p><p>Next stanza</p>'}
      />
    );

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toHaveTextContent("First line Second line");
    expect(paragraphs[1]).toBeEmptyDOMElement();
    expect(paragraphs[1]).toHaveStyle({ lineHeight: "2.25" });
    expect(paragraphs[2]).toHaveTextContent("Next stanza");
  });

  it("sanitizes authored HTML without changing Tiptap image markup", () => {
    const savedHtml =
      '<h2 id="saved-heading">Overview</h2><img src="/uploads/map.webp" alt="Route map" width="640" height="360" class="authored-image"><script>unsafe()</script>';

    const { container } = render(<RichTextRenderer html={savedHtml} previewMode />);
    const image = screen.getByRole("img", { name: "Route map" });

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).not.toHaveAttribute("id");
    expect(image).toHaveClass("authored-image");
    expect(image).toHaveAttribute("src", "/uploads/map.webp");
    expect(image).toHaveAttribute("width", "640");
    expect(image).toHaveAttribute("height", "360");
    expect(image.closest("figure")).not.toBeInTheDocument();
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

  it("leaves Tiptap image wrappers and alignment untouched", () => {
    const { container } = render(
      <RichTextRenderer html='<div class="image" style="text-align: center"><img src="/flower.jpg" alt="Flower" width="240" align="center"></div>' />
    );

    const image = screen.getByRole("img", { name: "Flower" });
    const wrapper = container.querySelector("div.image");

    expect(wrapper).toHaveStyle({ textAlign: "center" });
    expect(wrapper).toContainElement(image);
    expect(image).toHaveAttribute("align", "center");
    expect(image).toHaveAttribute("width", "240");
    expect(screen.queryByRole("button", { name: "Preview Flower" })).not.toBeInTheDocument();
  });
});
