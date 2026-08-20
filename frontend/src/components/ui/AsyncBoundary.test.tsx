import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AsyncBoundary, isChunkLoadError } from "./AsyncBoundary";

function BrokenContent() {
  throw new Error("Failed to fetch dynamically imported module");
}

describe("AsyncBoundary", () => {
  it("recognizes common lazy chunk failures", () => {
    expect(isChunkLoadError(new Error("ChunkLoadError: Loading chunk 4 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("ordinary render failure"))).toBe(false);
  });

  it("contains a failure and exposes a retry without removing siblings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRetry = vi.fn();
    render(
      <>
        <span>Stable sibling</span>
        <AsyncBoundary label="Preview" onRetry={onRetry}>
          <BrokenContent />
        </AsyncBoundary>
      </>
    );

    expect(screen.getByText("Stable sibling")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Preview could not be downloaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
