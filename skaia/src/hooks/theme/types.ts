export type ThemeContextType = {
  theme: "light" | "dark" | "inherit";
  specifyTheme: (theme: "light" | "dark" | "system") => void;
};
