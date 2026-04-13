import { Helmet } from "react-helmet-async";
import type { Branding, SEOConfig } from "./landing/types";

export default function SiteHead({
  seo,
  branding,
}: {
  seo: SEOConfig | null;
  branding: Branding | null;
}) {
  if (!seo && !branding) return null;

  const title = branding?.header_title || branding?.site_name || "";
  const subtitle = branding?.header_subtitle || "";
  const pageTitle = title
    ? subtitle
      ? `${title} – ${subtitle}`
      : title
    : undefined;

  return (
    <Helmet>
      {pageTitle && <title>{pageTitle}</title>}
      {seo?.description && (
        <meta name="description" content={seo.description} />
      )}
      {seo?.og_image && <meta property="og:image" content={seo.og_image} />}
      {branding?.logo_url && <link rel="icon" href={branding.logo_url} />}
    </Helmet>
  );
}
