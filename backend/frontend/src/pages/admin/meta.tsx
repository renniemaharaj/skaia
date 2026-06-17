import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { FileText, Paintbrush } from "lucide-react";
import { useSiteConfig } from "../../hooks/useSiteConfig";
import MetaControlPanel from "../../components/admin/MetaControlPanel";
import { layoutModeAtom } from "../../atoms/layoutMode";
import { SideRouteShell } from "../../components/layout/SideRouteShell";

export function AdminMetaSettings() {
  const { branding, seo } = useSiteConfig();
  const setLayoutMode = useSetAtom(layoutModeAtom);

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  if (!branding || !seo) {
    return (
      <SideRouteShell title="Site Configuration" backTo="/" backLabel="Exit">
        <div style={{ textAlign: "center" }}>Loading settings...</div>
      </SideRouteShell>
    );
  }

  const initialConfig = {
    description: seo.description || branding.tagline || branding.header_subtitle || "",
    og_image: seo.og_image || "",
    dom_skin: seo.dom_skin || "",
    dom_video: seo.dom_video || "",
    particle_style: seo.particle_style || "none",
  };

  return (
    <SideRouteShell
      title="Site Configuration"
      subtitle="Manage SEO, visuals, and site-wide metadata."
      backTo="/"
      backLabel="Exit"
      tabs={[
        {
          to: "/admin/meta/seo",
          match: "/admin/meta/seo",
          label: "SEO",
          icon: <FileText size={15} />,
        },
        {
          to: "/admin/meta/visuals",
          match: "/admin/meta/visuals",
          label: "Visuals",
          icon: <Paintbrush size={15} />,
        },
      ]}
    >
      <Routes>
        <Route
          path="seo"
          element={
            <MetaControlPanel
              category="seo"
              initialConfig={initialConfig}
              onUpdate={() => window.location.reload()}
            />
          }
        />
        <Route
          path="visuals"
          element={
            <MetaControlPanel
              category="visuals"
              initialConfig={initialConfig}
              onUpdate={() => window.location.reload()}
            />
          }
        />
        <Route path="*" element={<Navigate to="seo" replace />} />
      </Routes>
    </SideRouteShell>
  );
}
