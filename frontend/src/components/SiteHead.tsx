import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import type { Branding, SEOConfig } from "../components/page/types";
import { googleFontStylesheetURL, normalizeSiteFontFamily } from "../utils/siteFont";

export default function SiteHead({
  seo,
  branding,
}: {
  seo: SEOConfig | null;
  branding: Branding | null;
}) {
  const title = branding?.header_title || branding?.site_name || "";
  const subtitle = branding?.header_subtitle || "";
  const pageTitle = title ? (subtitle ? `${title} – ${subtitle}` : title) : undefined;
  const fontFamily = normalizeSiteFontFamily(seo?.font_family);
  const fontStylesheet = googleFontStylesheetURL(fontFamily);

  useEffect(() => {
    if (!fontFamily) {
      document.documentElement.style.removeProperty("--font-sans");
      return;
    }
    document.documentElement.style.setProperty(
      "--font-sans",
      `"${fontFamily}", system-ui, -apple-system, sans-serif`
    );
    return () => {
      document.documentElement.style.removeProperty("--font-sans");
    };
  }, [fontFamily]);

  if (!seo && !branding) return null;

  return (
    <>
      <Helmet>
        {pageTitle && <title>{pageTitle}</title>}
        {seo?.description && <meta name="description" content={seo.description} />}
        {seo?.og_image && <meta property="og:image" content={seo.og_image} />}
        {branding?.logo_url && <link rel="icon" href={branding.logo_url} />}
      </Helmet>
      {fontStylesheet && (
        <link rel="stylesheet" href={fontStylesheet} precedence="default" data-site-font />
      )}
    </>
  );
}
