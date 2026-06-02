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
        description:
          seo.description || branding.tagline || branding.header_subtitle || "",
        og_image: seo.og_image || "",
        dom_skin: seo.dom_skin || "",
        dom_video: seo.dom_video || "",
        particle_style: seo.particle_style || "none",
      }}
      onUpdate={() => window.location.reload()}
    />
  );
}
