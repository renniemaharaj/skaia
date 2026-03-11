import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import type {
  Branding,
  SEOConfig,
  FooterConfig,
} from "../components/landing/types";
import { apiRequest } from "../utils/api";
import { brandingAtom, footerConfigAtom } from "../atoms/config";

/**
 * Fetches branding, SEO, and footer config from the API and dynamically updates
 * document.title, meta description, og:image, favicon, and Jotai atoms.
 *
 * Safe to call from any route — runs once on mount.
 */
export function useSiteConfig() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [seo, setSeo] = useState<SEOConfig | null>(null);
  const setBrandingAtom = useSetAtom(brandingAtom);
  const setFooterAtom = useSetAtom(footerConfigAtom);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [b, s, f] = await Promise.all([
          apiRequest<Branding>("/config/branding"),
          apiRequest<SEOConfig>("/config/seo"),
          apiRequest<FooterConfig>("/config/footer"),
        ]);
        setBranding(b);
        setSeo(s);
        setBrandingAtom(b);
        setFooterAtom(f);

        // We intentionally do not mutate the document head here.
        // A dedicated React component (using react-helmet-async) consumes
        // `branding` and `seo` to render head tags in a React-friendly way.
      } catch (err) {
        console.warn("Failed to load site config:", err);
      }
    };

    loadConfig();
  }, [setBrandingAtom, setFooterAtom]);

  return { branding, seo };
}
