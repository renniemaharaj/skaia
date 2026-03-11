import { type ReactNode, createContext } from "react";
// import useTheme from "../../hooks/useTheme";

import type { ThemeContextType } from "./types";
import useTheme from "../useTheme";

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined,
);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { theme, specifyTheme } = useTheme();

  return (
    <ThemeContext.Provider value={{ theme, specifyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
