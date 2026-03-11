import { atom } from "jotai";

export const themeAtom = atom<"light" | "dark">(
  (localStorage.getItem("theme") as "light" | "dark" | null) ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"),
);
