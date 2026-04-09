import { useEffect, useState } from "react";

/**
 * Detect guest sandbox mode via the presence of a DOM div with class
 * `guest-sandbox`.
 *
 * The hook uses MutationObserver so removing the div will immediately
 * switch sandbox mode off.
 */
export function useGuestSandboxMode(): boolean {
  const [guestSandboxMode, setGuestSandboxMode] = useState(
    () =>
      typeof document !== "undefined" &&
      Boolean(document.querySelector<HTMLDivElement>("div.guest-sandbox")),
  );

  useEffect(() => {
    const selector = "div.guest-sandbox";

    const checkSandbox = () => {
      const node = document.querySelector<HTMLDivElement>(selector);
      setGuestSandboxMode(Boolean(node));
    };

    checkSandbox();

    const observer = new MutationObserver(() => {
      checkSandbox();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return guestSandboxMode;
}
