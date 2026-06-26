import { type ReactNode, createContext } from "react";
// import useTheme from "../../hooks/useTheme";

import useTheme from "../useTheme";
import type { ThemeContextType } from "./types";

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { theme, specifyTheme } = useTheme();

  return <ThemeContext.Provider value={{ theme, specifyTheme }}>{children}</ThemeContext.Provider>;
};
