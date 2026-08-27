import { useAtomValue } from "jotai";
import { Navigate, Route, Routes } from "react-router-dom";
import { hasPermissionAtom } from "../../atoms/auth";
import MetaControlPanel from "../../components/admin/MetaControlPanel";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import { Unauthorized } from "../../components/page/Unauthorized";
import { useSiteConfig } from "../../hooks/useSiteConfig";

export function AdminMetaSettings() {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const { branding, seo } = useSiteConfig();
  if (!hasPermission("home.manage")) {
    return <Unauthorized />;
  }
  if (!branding || !seo) {
    return (
      <ModulePageShell backTo="/" backLabel="Exit Settings" width="comfortable">
        <div className="managed-form modal">Loading settings...</div>
      </ModulePageShell>
    );
  }

  const initialConfig = {
    description: seo.description || branding.tagline || branding.header_subtitle || "",
    og_image: seo.og_image || "",
    dom_skin: seo.dom_skin || "",
    dom_video: seo.dom_video || "",
    particle_style: seo.particle_style || "none",
    font_family: seo.font_family || "",
  };

  return (
    <ModulePageShell backTo="/" backLabel="Exit Settings" width="comfortable">
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
    </ModulePageShell>
  );
}
