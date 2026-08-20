import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsSkeleton } from "./AnalyticsSkeleton";

describe("AnalyticsSkeleton", () => {
  it("reserves the analytics panel and keeps its close action usable", async () => {
    const onClose = vi.fn();
    const { container } = render(<AnalyticsSkeleton onClose={onClose} />);
    expect(screen.getByRole("status", { name: "Loading analytics" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(container.querySelectorAll(".analytics-skeleton__stats > div")).toHaveLength(4);
    expect(container.querySelector(".analytics-skeleton__chart")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close analytics" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
