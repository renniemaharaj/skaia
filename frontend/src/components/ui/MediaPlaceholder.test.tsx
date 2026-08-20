import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { MediaPlaceholder } from "./MediaPlaceholder";

describe("MediaPlaceholder", () => {
  it("opens its own media in the lightbox by default", () => {
    render(<MediaPlaceholder alt="Gallery sunset" href="/sunset.webp" mediaType="image" />);

    fireEvent.click(screen.getByRole("button", { name: "Preview Gallery sunset" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Gallery sunset" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Close media preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can explicitly disable lightbox preview", () => {
    render(
      <MediaPlaceholder
        alt="Decorative texture"
        href="/texture.webp"
        mediaType="image"
        previewable={false}
      />
    );

    expect(screen.queryByRole("button", { name: /Preview/ })).not.toBeInTheDocument();
  });

  it("shows an editable placeholder when no content server URL is configured", () => {
    render(<MediaPlaceholder alt="Payroll entry screen" mediaType="image" />);

    expect(screen.getByText("Placeholder for asset here")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("reveals an image only after the browser validates that it loaded", () => {
    render(
      <MediaPlaceholder
        alt="Payroll entry screen"
        href="https://content.example.test/payroll-entry.webp"
        mediaType="image"
        size={{ aspectRatio: "16 / 9", width: 720 }}
      />
    );
    const image = screen.getByRole("img", { name: "Payroll entry screen" });
    const placeholder = image.closest("figure");

    expect(screen.getByRole("status")).toHaveTextContent("Loading Payroll entry screen");
    expect(placeholder).toHaveAttribute("aria-busy", "true");
    expect(placeholder).toHaveStyle({ aspectRatio: "16 / 9" });
    fireEvent.load(image);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(placeholder).toHaveAttribute("aria-busy", "false");
    expect(placeholder).not.toHaveStyle({ aspectRatio: "16 / 9" });
    expect(image).toHaveClass("ready");
    expect(
      screen.getByText("Payroll entry screen", { selector: "figcaption" })
    ).toBeInTheDocument();
  });

  it("preserves an explicitly sized thumbnail frame after readiness", () => {
    render(
      <MediaPlaceholder
        alt="Product cover"
        fit="cover"
        href="/uploads/cover.webp"
        layout="thumbnail"
        mediaType="image"
        size={{ aspectRatio: "1 / 1", height: 64, width: 64 }}
      />
    );
    const image = screen.getByRole("img", { name: "Product cover" });
    const placeholder = image.closest("figure");

    fireEvent.load(image);

    expect(placeholder).toHaveStyle({ aspectRatio: "1 / 1", height: "64px", width: "64px" });
    expect(placeholder).toHaveClass("media-placeholder--thumbnail", "media-placeholder--fit-cover");
    expect(placeholder).toHaveAttribute("data-preserve-frame", "true");
    expect(screen.queryByText("Product cover", { selector: "figcaption" })).not.toBeInTheDocument();
  });

  it("keeps the placeholder visible when the content server returns an unusable asset", () => {
    render(
      <MediaPlaceholder
        alt="Payroll walkthrough"
        href="https://content.example.test/missing.mp4"
        mediaType="video"
      />
    );

    fireEvent.error(screen.getByLabelText("Payroll walkthrough"));
    expect(screen.getByRole("alert")).toHaveTextContent("Asset failed to load");
    expect(screen.getByRole("alert")).toHaveTextContent("content server asset is unavailable");
  });

  it("tracks load state against the current asset without a stale reset", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <MediaPlaceholder
        alt="First asset"
        href="https://content.example.test/first.webp"
        mediaType="image"
        onReady={onReady}
      />
    );

    const firstImage = screen.getByRole("img", { name: "First asset" });
    fireEvent.load(firstImage);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(1);

    rerender(
      <MediaPlaceholder
        alt="Second asset"
        href="https://content.example.test/second.webp"
        mediaType="image"
        onReady={onReady}
      />
    );
    const secondImage = screen.getByRole("img", { name: "Second asset" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading Second asset");

    fireEvent.load(firstImage);
    expect(screen.getByRole("status")).toHaveTextContent("Loading Second asset");
    expect(onReady).toHaveBeenCalledTimes(1);

    fireEvent.load(secondImage);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(secondImage).toHaveClass("ready");
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it("passes playback, captions, and lifecycle options to video", () => {
    const onEnded = vi.fn();
    const onReady = vi.fn();
    const videoRef = createRef<HTMLVideoElement>();
    render(
      <MediaPlaceholder
        alt="Launch walkthrough"
        autoPlay
        captionsHref="/captions/launch.vtt"
        controls={false}
        href="/videos/launch.webm"
        loop
        mediaClassName="hero-media"
        mediaType="video"
        muted
        onEnded={onEnded}
        onReady={onReady}
        playsInline
        poster="/images/launch-poster.webp"
        preload="auto"
        mediaStyle={{ objectPosition: "top" }}
        videoRef={videoRef}
      />
    );

    const video = screen.getByLabelText("Launch walkthrough");
    expect(video).toHaveAttribute("autoplay");
    expect(video).not.toHaveAttribute("controls");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("poster", "/images/launch-poster.webp");
    expect(video).toHaveAttribute("preload", "auto");
    expect(video).toHaveClass("hero-media");
    expect(video).toHaveStyle({ objectPosition: "top" });
    expect(videoRef.current).toBe(video);
    expect(video.querySelector("track")).toHaveAttribute("src", "/captions/launch.vtt");

    fireEvent.loadedMetadata(video);
    expect(onReady).toHaveBeenCalledOnce();
    fireEvent.ended(video);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("supports audio readiness and reports failures", () => {
    const onError = vi.fn();
    const { rerender } = render(
      <MediaPlaceholder
        alt="Audio excerpt"
        href="/audio/excerpt.ogg"
        mediaType="audio"
        onError={onError}
      />
    );
    const audio = screen.getByLabelText("Audio excerpt");

    fireEvent.loadedMetadata(audio);
    expect(audio).toHaveClass("ready");

    rerender(
      <MediaPlaceholder
        alt="Missing excerpt"
        href="/audio/missing.ogg"
        mediaType="audio"
        onError={onError}
      />
    );
    fireEvent.error(screen.getByLabelText("Missing excerpt"));
    expect(onError).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Missing excerpt");
  });

  it("merges caller classes and styles without losing frame sizing", () => {
    render(
      <MediaPlaceholder
        alt="Inline logo"
        className="branding-logo"
        href="/logo.webp"
        layout="inline"
        mediaType="image"
        size={{ height: 40, width: 40 }}
        style={{ borderRadius: 20 }}
      />
    );

    const figure = screen.getByRole("img", { name: "Inline logo" }).closest("figure");
    expect(figure).toHaveClass("branding-logo", "media-placeholder--inline");
    expect(figure).toHaveStyle({ height: "40px", width: "40px", borderRadius: "20px" });
  });

  it("removes decorative media and its status text from the accessibility tree", () => {
    const { container } = render(
      <MediaPlaceholder alt="" decorative href="/watermark.webp" mediaType="image" />
    );

    expect(container.querySelector("figure")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
