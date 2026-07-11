import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const useTheme = () => {
  const location = useLocation();
  const isClipMaker = location.pathname.startsWith("/clipmaker");

  const detectOverride = () => {
    const override = localStorage.getItem("theme");
    return override as "light" | "dark" | null;
  };

  const getNormalTheme = (): "light" | "dark" => {
    const override = detectOverride();
    if (override) return override;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const setOverride = (theme: "light" | "dark" | "system") => {
    if (theme === "system") {
      localStorage.removeItem("theme");
    } else {
      localStorage.setItem("theme", theme);
    }
    updateThemeState();
  };

  const [theme, setTheme] = useState<"light" | "dark" | "inherit">(
    isClipMaker ? "dark" : getNormalTheme()
  );

  const updateThemeState = useCallback(() => {
    if (isClipMaker) {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      const normalTheme = getNormalTheme();
      setTheme(normalTheme);
      document.documentElement.setAttribute("data-theme", normalTheme);
    }
  }, [isClipMaker]);

  useEffect(() => {
    updateThemeState();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (!detectOverride() && !isClipMaker) {
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "theme") {
        updateThemeState();
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [updateThemeState, isClipMaker]);

  return {
    theme,
    specifyTheme: setOverride,
    usesSystemTheme: !detectOverride(),
  };
};

export default useTheme;
