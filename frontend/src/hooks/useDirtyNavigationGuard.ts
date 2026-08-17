import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { customConfirm } from "../components/ui/Prompt";

interface DirtyNavigationGuardOptions {
  title: string;
  body: string;
}

/**
 * Protects in-app link navigation while using React Router's declarative
 * BrowserRouter. React Router's useBlocker requires a data router and throws in
 * this application, so the guard intercepts same-origin anchors before routing.
 */
export function useDirtyNavigationGuard(active: boolean, options: DirtyNavigationGuardOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!active) return;

    const guard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();
      void customConfirm({
        title: options.title,
        body: options.body,
        confirmLabel: "Discard changes",
        destructive: true,
      }).then(confirmed => {
        if (confirmed) navigate(`${destination.pathname}${destination.search}${destination.hash}`);
      });
    };

    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [active, navigate, options.body, options.title]);
}
