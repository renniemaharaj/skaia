import { atom } from "jotai";

export const apiBaseUrlAtom = atom("/api");

export const wsBaseUrlAtom = atom(
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`,
);
