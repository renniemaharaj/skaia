import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("falls back to initials and reports a broken image", () => {
    const onImageError = vi.fn();
    render(
      <UserAvatar
        src="/broken-avatar.png"
        alt="Administrator"
        initials="A"
        onImageError={onImageError}
      />
    );

    fireEvent.error(screen.getByRole("img", { name: "Administrator" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(onImageError).toHaveBeenCalledOnce();
  });
});
