import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Observer = Pick<IntersectionObserver, "disconnect" | "observe">;

export type IntersectionObserverFactory = (
  callback: IntersectionObserverCallback,
  options: IntersectionObserverInit
) => Observer;

export interface ViewportActivationOptions {
  /** Render immediately and skip observation. */
  eager?: boolean;
  /** Set false when deferral is inappropriate for the current state. */
  enabled?: boolean;
  /** Stay active after the first intersection. */
  once?: boolean;
  /** Optional scroll container. The browser viewport is used when omitted. */
  root?: Element | null;
  /** Preload shortly before ordinary viewport entry by default. */
  rootMargin?: string;
  threshold?: number | number[];
  createObserver?: IntersectionObserverFactory;
  onActivate?: () => void;
}

export interface ViewportActivation {
  active: boolean;
  activate: () => void;
  ref: (node: HTMLElement | null) => void;
}

const createBrowserObserver: IntersectionObserverFactory = (callback, options) =>
  new window.IntersectionObserver(callback, options);

/**
 * Controls whether a subtree is allowed to mount. This is deliberately separate
 * from Suspense: an unmounted lazy component cannot import code or start effects.
 */
export function useViewportActivation({
  eager = false,
  enabled = true,
  once = true,
  root = null,
  rootMargin = "200px 0px",
  threshold = 0,
  createObserver,
  onActivate,
}: ViewportActivationOptions = {}): ViewportActivation {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(eager || !enabled);
  const activationReportedRef = useRef(eager || !enabled);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const activate = useCallback(() => {
    setActive(true);
    if (!activationReportedRef.current) {
      activationReportedRef.current = true;
      onActivateRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (eager || !enabled) activate();
  }, [activate, eager, enabled]);

  useEffect(() => {
    if (!element || eager || !enabled || (once && active)) return;

    const factory =
      createObserver ??
      (typeof window !== "undefined" && "IntersectionObserver" in window
        ? createBrowserObserver
        : undefined);
    if (!factory) {
      activate();
      return;
    }

    const observer = factory(
      entries => {
        const entry = entries.find(candidate => candidate.target === element) ?? entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          activate();
        } else if (!once) {
          setActive(false);
        }
      },
      { root, rootMargin, threshold }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    activate,
    active,
    createObserver,
    eager,
    element,
    enabled,
    once,
    root,
    rootMargin,
    threshold,
  ]);

  return { active, activate, ref: setElement };
}

export interface DeferredViewportProps extends ViewportActivationOptions {
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
  minHeight?: CSSProperties["minHeight"];
  style?: CSSProperties;
}

/** A stable wrapper that swaps its fallback for children after viewport activation. */
export function DeferredViewport({
  children,
  fallback,
  className = "",
  minHeight,
  style,
  ...options
}: DeferredViewportProps) {
  const { active, ref } = useViewportActivation(options);
  const wrapperStyle = minHeight === undefined ? style : { ...style, minHeight };

  return (
    <div
      ref={ref}
      className={className}
      style={wrapperStyle}
      aria-busy={!active}
      data-deferred-state={active ? "active" : "pending"}
    >
      {active ? children : fallback}
    </div>
  );
}

export interface IntentActivationOptions {
  /** Pointer fly-overs shorter than this delay do not activate the content. */
  delayMs?: number;
  eager?: boolean;
  enabled?: boolean;
  onActivate?: () => void;
}

export interface IntentActivation {
  active: boolean;
  activate: () => void;
  cancelPending: () => void;
  intentProps: Pick<
    HTMLAttributes<HTMLElement>,
    "onBlurCapture" | "onFocusCapture" | "onPointerEnter" | "onPointerLeave"
  >;
}

/**
 * Activates expensive content after deliberate mouse hover or keyboard focus.
 * Touch and pen callers use `activate` from an explicit control so navigation
 * is never delayed or triggered accidentally.
 */
export function useIntentActivation({
  delayMs = 180,
  eager = false,
  enabled = true,
  onActivate,
}: IntentActivationOptions = {}): IntentActivation {
  const [active, setActive] = useState(eager || !enabled);
  const timerRef = useRef<number | null>(null);
  const activationReportedRef = useRef(eager || !enabled);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const activate = useCallback(() => {
    cancelPending();
    setActive(true);
    if (!activationReportedRef.current) {
      activationReportedRef.current = true;
      onActivateRef.current?.();
    }
  }, [cancelPending]);

  const schedule = useCallback(() => {
    if (active || !enabled || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(activate, Math.max(0, delayMs));
  }, [activate, active, delayMs, enabled]);

  useEffect(() => {
    if (eager || !enabled) activate();
  }, [activate, eager, enabled]);

  useEffect(() => cancelPending, [cancelPending]);

  return {
    active,
    activate,
    cancelPending,
    intentProps: {
      onBlurCapture: cancelPending,
      onFocusCapture: activate,
      onPointerEnter: event => {
        if (!event.pointerType || event.pointerType === "mouse") schedule();
      },
      onPointerLeave: cancelPending,
    },
  };
}
