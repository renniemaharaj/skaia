import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaPlaceholder } from "./MediaPlaceholder";

describe("MediaPlaceholder", () => {
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
    const { rerender } = render(
      <MediaPlaceholder
        alt="First asset"
        href="https://content.example.test/first.webp"
        mediaType="image"
      />
    );

    fireEvent.load(screen.getByRole("img", { name: "First asset" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(
      <MediaPlaceholder
        alt="Second asset"
        href="https://content.example.test/second.webp"
        mediaType="image"
      />
    );
    const secondImage = screen.getByRole("img", { name: "Second asset" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading Second asset");

    fireEvent.load(secondImage);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(secondImage).toHaveClass("ready");
  });
});
