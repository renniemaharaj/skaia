import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeferredViewport,
  type IntersectionObserverFactory,
  useIntentActivation,
} from "./DeferredRender";

function createObserverHarness() {
  let callback: IntersectionObserverCallback | undefined;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const createObserver: IntersectionObserverFactory = (nextCallback, options) => {
    callback = nextCallback;
    expect(options.rootMargin).toBe("48px 0px");
    return { disconnect, observe };
  };

  return {
    createObserver,
    disconnect,
    observe,
    intersect(isIntersecting: boolean) {
      const target = observe.mock.calls[0]?.[0] as Element;
      callback?.(
        [{ isIntersecting, target } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    },
  };
}

function IntentFixture({ onActivate }: { onActivate: () => void }) {
  const { active, activate, intentProps } = useIntentActivation({ delayMs: 200, onActivate });
  return (
    <div {...intentProps}>
      <button type="button" onClick={activate}>
        {active ? "Preview ready" : "Load preview"}
      </button>
    </div>
  );
}

describe("deferred rendering", () => {
  afterEach(() => vi.useRealTimers());

  it("mounts children once when the observed wrapper approaches the viewport", () => {
    const observer = createObserverHarness();
    const { unmount } = render(
      <DeferredViewport
        createObserver={observer.createObserver}
        fallback={<span>Section skeleton</span>}
        rootMargin="48px 0px"
        minHeight={180}
      >
        <span>Heavy section</span>
      </DeferredViewport>
    );

    expect(screen.getByText("Section skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Heavy section")).not.toBeInTheDocument();
    expect(observer.observe).toHaveBeenCalledOnce();

    act(() => observer.intersect(true));
    expect(screen.getByText("Heavy section")).toBeInTheDocument();
    expect(screen.queryByText("Section skeleton")).not.toBeInTheDocument();
    expect(observer.disconnect).toHaveBeenCalledOnce();

    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("renders safely when IntersectionObserver is unavailable", () => {
    const original = window.IntersectionObserver;
    Reflect.deleteProperty(window, "IntersectionObserver");

    render(
      <DeferredViewport fallback={<span>Fallback</span>}>
        <span>Available content</span>
      </DeferredViewport>
    );

    expect(screen.getByText("Available content")).toBeInTheDocument();
    window.IntersectionObserver = original;
  });

  it("supports a custom scroll root and reversible observation", () => {
    const observer = createObserverHarness();
    const scrollRoot = document.createElement("div");
    render(
      <DeferredViewport
        createObserver={(callback, options) => {
          expect(options.root).toBe(scrollRoot);
          return observer.createObserver(callback, options);
        }}
        fallback={<span>Pending</span>}
        once={false}
        root={scrollRoot}
        rootMargin="48px 0px"
      >
        <span>Visible</span>
      </DeferredViewport>
    );
    act(() => observer.intersect(true));
    expect(screen.getByText("Visible")).toBeInTheDocument();
    act(() => observer.intersect(false));
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("cancels mouse fly-overs and activates once after deliberate hover", () => {
    vi.useFakeTimers();
    const onActivate = vi.fn();
    render(<IntentFixture onActivate={onActivate} />);
    const wrapper = screen.getByRole("button", { name: "Load preview" }).parentElement!;

    fireEvent.pointerEnter(wrapper, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerLeave(wrapper, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("button", { name: "Load preview" })).toBeInTheDocument();

    fireEvent.pointerEnter(wrapper, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("button", { name: "Preview ready" })).toBeInTheDocument();
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("activates immediately for keyboard focus or an explicit touch control", () => {
    const onActivate = vi.fn();
    const { rerender } = render(<IntentFixture onActivate={onActivate} />);

    fireEvent.focus(screen.getByRole("button", { name: "Load preview" }));
    expect(screen.getByRole("button", { name: "Preview ready" })).toBeInTheDocument();
    expect(onActivate).toHaveBeenCalledOnce();

    const nextActivate = vi.fn();
    rerender(<IntentFixture key="touch" onActivate={nextActivate} />);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Load preview" }).parentElement!, {
      pointerType: "touch",
    });
    expect(screen.getByRole("button", { name: "Load preview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load preview" }));
    expect(screen.getByRole("button", { name: "Preview ready" })).toBeInTheDocument();
    expect(nextActivate).toHaveBeenCalledOnce();
  });
});
