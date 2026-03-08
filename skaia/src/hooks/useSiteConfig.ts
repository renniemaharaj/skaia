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

        // Title
        if (s?.title) {
          document.title = s.title;
        }

        // Meta description
        if (s?.description) {
          let meta = document.querySelector<HTMLMetaElement>(
            'meta[name="description"]',
          );
          if (!meta) {
            meta = document.createElement("meta");
            meta.name = "description";
            document.head.appendChild(meta);
          }
          meta.content = s.description;
        }

        // OG Image
        if (s?.og_image) {
          let og = document.querySelector<HTMLMetaElement>(
            'meta[property="og:image"]',
          );
          if (!og) {
            og = document.createElement("meta");
            og.setAttribute("property", "og:image");
            document.head.appendChild(og);
          }
          og.content = s.og_image;
        }

        // Favicon
        if (b?.favicon_url) {
          let link =
            document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = b.favicon_url;
        }
      } catch (err) {
        console.warn("Failed to load site config:", err);
      }
    };

    loadConfig();
  }, [setBrandingAtom, setFooterAtom]);

  return { branding, seo };
}
