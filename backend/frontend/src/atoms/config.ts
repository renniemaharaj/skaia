import { atom } from "jotai";
import type { Branding, SEOConfig, FooterConfig } from "../pages/page/types";

export const apiBaseUrlAtom = atom("/api");

export const wsBaseUrlAtom = atom(
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`,
);

export type FeatureMap = Record<string, boolean>;
export const featuresAtom = atom<FeatureMap | null>(null);

export const brandingAtom = atom<Branding | null>(null);
export const footerConfigAtom = atom<FooterConfig | null>(null);
export const seoAtom = atom<SEOConfig | null>(null);
