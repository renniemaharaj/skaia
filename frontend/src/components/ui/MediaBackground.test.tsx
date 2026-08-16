import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaBackground } from "./MediaBackground";

describe("MediaBackground", () => {
  it("reveals a repeated background only after its URL validates", () => {
    const { rerender } = render(
      <MediaBackground alt="Tenant pattern" imageHref="/skins/pattern.webp" repeatImage />
    );
    const image = screen.getByRole("img", { name: "Tenant pattern", hidden: true });
    const frame = image.closest("figure");

    expect(frame).not.toHaveStyle({ backgroundImage: 'url("/skins/pattern.webp")' });
    fireEvent.load(image);
    expect(frame).toHaveStyle({ backgroundImage: 'url("/skins/pattern.webp")' });
    expect(frame).toHaveClass("media-background--repeat");

    rerender(<MediaBackground alt="New pattern" imageHref="/skins/new.webp" repeatImage />);
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("Loading New pattern");
    expect(
      screen.getByRole("img", { name: "New pattern", hidden: true }).closest("figure")
    ).not.toHaveStyle({
      backgroundImage: 'url("/skins/pattern.webp")',
    });
  });

  it("preserves non-interactive background-video playback intent", () => {
    render(<MediaBackground alt="Profile background" videoHref="/backgrounds/profile.webm" />);

    const video = screen.getByLabelText("Profile background");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("playsinline");
    expect(video).not.toHaveAttribute("controls");
    expect(video.closest("figure")).toHaveClass("media-background");
  });
});
