import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import UserUploads from "./UserUploads";

const uploads = [
  {
    url: "/uploads/photo.webp",
    filename: "Photo",
    size: 1024,
    type: "images",
    mime_type: "image/webp",
    created_at: "2026-08-16T12:00:00Z",
  },
  {
    url: "/uploads/clip.mp4",
    filename: "Clip",
    size: 2048,
    type: "videos",
    mime_type: "video/mp4",
    created_at: "2026-08-16T12:00:00Z",
  },
];

describe("UserUploads media", () => {
  it("uses shared fixed-frame thumbnails and keeps preview interaction available after failure", async () => {
    render(
      <MemoryRouter>
        <UserUploads
          displayName="Rennie"
          externalUploads={uploads}
          externalViewMode="grid"
          hideHeader
          userId={undefined}
        />
      </MemoryRouter>
    );

    const image = await screen.findByRole("img", { name: "Photo" });
    const video = screen.getByLabelText("Clip");
    expect(image.closest("figure")).toHaveClass("media-placeholder--fill");
    expect(video.closest("figure")).toHaveAttribute("data-preserve-frame", "true");

    fireEvent.error(image);
    expect(screen.getByRole("alert")).toHaveTextContent("Photo");
    fireEvent.click(screen.getByRole("alert"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "Photo" })).toHaveAttribute(
      "src",
      "/uploads/photo.webp"
    );
  });
});
