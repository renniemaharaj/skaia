import { atom } from "jotai";
import type { Branding, FooterConfig } from "../components/landing/types";

export const apiBaseUrlAtom = atom("");

export const wsBaseUrlAtom = atom(
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`,
);

export const brandingAtom = atom<Branding | null>(null);
export const footerConfigAtom = atom<FooterConfig | null>(null);
