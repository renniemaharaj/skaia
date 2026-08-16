import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageAttachment } from "./MessageAttachment";

describe("MessageAttachment", () => {
  it("renders image attachments through the shared failure lifecycle without blocking the link", () => {
    render(
      <MessageAttachment messageType="image" name="Receipt" url="/attachments/receipt.webp" />
    );
    const image = screen.getByRole("img", { name: "Receipt" });

    expect(image.closest("a")).toHaveAttribute("href", "/attachments/receipt.webp");
    fireEvent.error(image);
    expect(screen.getByRole("alert")).toHaveTextContent("Receipt");
    expect(screen.getByRole("alert").closest("a")).toHaveAttribute(
      "href",
      "/attachments/receipt.webp"
    );
  });

  it("keeps audio controls and the file-specific download fallback", () => {
    const { rerender } = render(
      <MessageAttachment messageType="audio" name="Interview" url="/attachments/interview.ogg" />
    );
    expect(screen.getByLabelText("Interview")).toHaveAttribute("controls");

    rerender(
      <MessageAttachment
        messageType="file"
        name="Archive.zip"
        size={2048}
        url="/attachments/archive.zip"
      />
    );
    expect(screen.getByRole("link", { name: /Archive\.zip\s*2 KB/ })).toHaveAttribute(
      "href",
      "/attachments/archive.zip"
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
