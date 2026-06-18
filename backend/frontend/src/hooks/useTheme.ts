import { useCallback, useEffect, useState } from "react";

const useTheme = () => {
  const detectOverride = () => {
    const override = localStorage.getItem("theme");
    return override as "light" | "dark" | null;
  };

  const setOverride = (theme: "light" | "dark" | "system") => {
    if (theme === "system") {
      localStorage.removeItem("theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
    updateThemeState();
  };

  const [theme, setTheme] = useState<"light" | "dark" | "inherit">(
    detectOverride() ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );

  const updateThemeState = useCallback(() => {
    const override = detectOverride();
    if (override) {
      setTheme(override);
      document.documentElement.setAttribute("data-theme", override);
    } else {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const isDark = mediaQuery.matches;
      setTheme(isDark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    }
  }, []);

  useEffect(() => {
    updateThemeState();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (!detectOverride()) {
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
  }, [updateThemeState]);

  return {
    theme,
    specifyTheme: setOverride,
    usesSystemTheme: !detectOverride(),
  };
};

export default useTheme;
