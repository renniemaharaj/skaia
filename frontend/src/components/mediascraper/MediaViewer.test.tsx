import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaViewer } from "./MediaViewer";

describe("MediaViewer", () => {
  it("uses shared thumbnail and lightbox media states for scraped images", () => {
    render(
      <MediaViewer
        job={{
          url: "https://example.test",
          status: "done",
          images: ["https://content.example.test/result.webp"],
        }}
      />
    );

    const thumbnail = screen.getByRole("img", { name: "thumbnail" });
    expect(thumbnail.closest("figure")).toHaveClass("media-placeholder--thumbnail");
    fireEvent.click(thumbnail);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Scraped image" })).toHaveAttribute(
      "src",
      "https://content.example.test/result.webp"
    );
    fireEvent.click(screen.getByRole("button", { name: "Close media preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
