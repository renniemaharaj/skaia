import { useSetAtom } from "jotai";
import { themeAtom } from "../atoms/theme";

export const setTheme = (theme: "light" | "dark") => {
  const setThemeAtom = useSetAtom(themeAtom);
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  setThemeAtom(theme);
};

export function convertBase64ToBlob(base64: string) {
  const arr = base64.split(",");
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
