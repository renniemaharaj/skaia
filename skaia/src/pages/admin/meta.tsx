// import MetaControlPanel from "../components/admin/MetaControlPanel";
import MetaControlPanel from "../../components/admin/MetaControlPanel";
import { useSiteConfig } from "../../hooks/useSiteConfig";
// import { useSiteConfig } from "../hooks/useSiteConfig";

export function AdminMetaSettings() {
  // Fetch current config using useSiteConfig
  const { branding, seo } = useSiteConfig();
  if (!branding || !seo) return <div>Loading...</div>;
  return (
    <MetaControlPanel
      initialConfig={{
        title: seo.title,
        description: seo.description,
        og_image: seo.og_image,
        favicon_url: branding.favicon_url,
      }}
      onUpdate={() => window.location.reload()}
    />
  );
}
