import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import { PageBrowsePreview, clearPagePreviewCacheForTests } from "./PageBrowsePreview";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));
vi.mock("./BlockRenderer", () => ({
  BlockRenderer: ({
    sections,
    preview,
    viewportRoot,
  }: { sections: unknown[]; preview?: boolean; viewportRoot?: Element }) => (
    <div
      data-testid="block-renderer"
      data-preview={preview ? "true" : "false"}
      data-root={
        viewportRoot?.getAttribute("data-custom-page-preview") !== null ? "thumbnail" : "other"
      }
    >
      {sections.length} sections
    </div>
  ),
}));

const requestMock = vi.mocked(apiRequest);
let observerCallback: IntersectionObserverCallback | undefined;

class ObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];

  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
}

function intersect(element: Element) {
  observerCallback?.(
    [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
    {} as IntersectionObserver
  );
}

describe("PageBrowsePreview", () => {
  beforeEach(() => {
    clearPagePreviewCacheForTests();
    requestMock.mockReset();
    window.IntersectionObserver = ObserverMock as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not request or import the renderer before viewport plus deliberate intent", async () => {
    vi.useFakeTimers();
    requestMock.mockResolvedValue({
      id: 7,
      content: `[{"id":1,"section_type":"rich_text","config":"{}"}]`,
      updated_at: "2026-08-20T12:00:00Z",
    });
    const { container } = render(<PageBrowsePreview pageId={7} revision="2026-08-20T12:00:00Z" />);
    const wrapper = container.querySelector("[data-custom-page-preview]")!;

    expect(requestMock).not.toHaveBeenCalled();
    act(() => intersect(wrapper));
    expect(requestMock).not.toHaveBeenCalled();
    fireEvent.pointerEnter(wrapper, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerLeave(wrapper, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(220));
    expect(requestMock).not.toHaveBeenCalled();

    fireEvent.pointerEnter(wrapper, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(220));
    expect(requestMock).toHaveBeenCalledOnce();
    expect(requestMock.mock.calls[0][0]).toBe("/pages/browse/7/preview");
    await act(async () => vi.dynamicImportSettled());
    expect(screen.getByTestId("block-renderer")).toHaveAttribute("data-preview", "true");
    expect(screen.getByTestId("block-renderer")).toHaveAttribute("data-root", "thumbnail");
  });

  it("lets keyboard/touch intent activate explicitly and aborts a stale revision", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    requestMock.mockImplementation(
      () => new Promise(resolve => (resolveRequest = resolve)) as Promise<never>
    );
    const { rerender } = render(<PageBrowsePreview pageId={9} revision="2026-08-20T12:00:00Z" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load preview" })));
    expect(requestMock).toHaveBeenCalledOnce();
    const signal = requestMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    rerender(<PageBrowsePreview pageId={9} revision="2026-08-20T12:01:00Z" />);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveRequest?.({ id: 9, content: "[]", updated_at: "2026-08-20T12:00:00Z" });
    });
    expect(screen.queryByText("No preview content")).not.toBeInTheDocument();
  });

  it("reuses the bounded revision cache without a second network request", async () => {
    requestMock.mockResolvedValue({ id: 3, content: "[]", updated_at: "revision" });
    const first = render(<PageBrowsePreview pageId={3} revision="revision" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load preview" })));
    expect(screen.getByText("No preview content")).toBeInTheDocument();
    first.unmount();

    render(<PageBrowsePreview pageId={3} revision="revision" />);
    expect(screen.getByText("No preview content")).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledOnce();
  });
});
