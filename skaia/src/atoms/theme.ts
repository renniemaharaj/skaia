import { atom } from "jotai";

export const themeAtom = atom(
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light",
);
