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

  return (
    <Helmet>
      {seo?.title && <title>{seo.title}</title>}
      {seo?.description && (
        <meta name="description" content={seo.description} />
      )}
      {seo?.og_image && <meta property="og:image" content={seo.og_image} />}
      {branding?.favicon_url && <link rel="icon" href={branding.favicon_url} />}
    </Helmet>
  );
}
