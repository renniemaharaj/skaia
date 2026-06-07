
import { Link, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useSiteConfig } from "../../hooks/useSiteConfig";
import MetaControlPanel from "../../components/admin/MetaControlPanel";

export function AdminMetaSettings() {
  const location = useLocation();
  const { branding, seo } = useSiteConfig();

  if (!branding || !seo) {
    return (
      <div className="page-shell">
        <div style={{ padding: "2rem", textAlign: "center" }}>Loading settings...</div>
      </div>
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
    <div className="page-shell">
      <header className="page-header">
        <div className="page-header__main">
          <div>
            <h1 className="page-title">Site Configuration</h1>
            <p className="page-subtitle">
              Manage SEO, visuals, and site-wide metadata.
            </p>
          </div>
        </div>
      </header>

      <div className="settings-grid grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "2rem", alignItems: "start" }}>
        <aside style={{ gridColumn: "1 / -1" }} className="settings-sidebar">
          <div className="ui-panel" style={{ padding: "1rem" }}>
            <nav style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <Link
                to="/admin/meta/seo"
                className={`btn ${location.pathname.includes("/seo") ? "btn-primary" : "btn-ghost"}`}
                style={{ flex: "1 1 auto", justifyContent: "center", fontSize: "0.95rem" }}
              >
                SEO
              </Link>
              <Link
                to="/admin/meta/visuals"
                className={`btn ${location.pathname.includes("/visuals") ? "btn-primary" : "btn-ghost"}`}
                style={{ flex: "1 1 auto", justifyContent: "center", fontSize: "0.95rem" }}
              >
                Visuals
              </Link>
            </nav>
          </div>
        </aside>

        <main className="ui-panel settings-main" style={{ gridColumn: "1 / -1", padding: "2rem", minHeight: "400px" }}>
          <Routes>
            <Route path="seo" element={<MetaControlPanel category="seo" initialConfig={initialConfig} onUpdate={() => window.location.reload()} />} />
            <Route path="visuals" element={<MetaControlPanel category="visuals" initialConfig={initialConfig} onUpdate={() => window.location.reload()} />} />
            <Route path="*" element={<Navigate to="seo" replace />} />
          </Routes>
        </main>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .settings-grid {
            grid-template-columns: 250px 1fr !important;
          }
          .settings-sidebar {
            grid-column: 1 / 2 !important;
          }
          .settings-sidebar nav {
            flex-direction: column !important;
          }
          .settings-sidebar nav a {
            justify-content: flex-start !important;
          }
          .settings-main {
            grid-column: 2 / -1 !important;
          }
        }
      `}</style>
    </div>
  );
}
