import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonContent, SkeletonPrimitive, SkeletonText } from "./Skeleton";

describe("Skeleton", () => {
  it("exposes one accessible busy region while hiding decorative geometry", () => {
    const { container } = render(
      <SkeletonContent label="Loading account details" variant="form" />
    );

    const status = screen.getByRole("status", { name: "Loading account details" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".skeleton-ui__composition")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(container.querySelectorAll(".skeleton-ui__primitive")).toHaveLength(5);
  });

  it("supports bounded text lines and explicit geometry", () => {
    const { container } = render(
      <SkeletonContent label="Loading article">
        <SkeletonPrimitive shape="media" height={120} />
        <SkeletonText lines={2} widths={["80%", "45%"]} />
      </SkeletonContent>
    );

    const primitives = container.querySelectorAll(".skeleton-ui__primitive");
    expect(primitives).toHaveLength(3);
    expect(primitives[0]).toHaveClass("skeleton-ui__primitive--media");
    expect(primitives[0]).toHaveStyle({ height: "120px" });
    expect(primitives[1]).toHaveStyle({ width: "80%" });
    expect(primitives[2]).toHaveStyle({ width: "45%" });
  });
});
