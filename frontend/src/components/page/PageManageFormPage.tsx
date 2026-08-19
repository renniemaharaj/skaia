import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { usePageData } from "../../hooks/usePageData";
import PageManagePanel from "./PageManagePanel";

export default function PageManageFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { page, loading, error, isEditable, refresh, updatePageSEO } = usePageData();

  useEffect(() => {
    if (slug) void refresh(slug);
  }, [refresh, slug]);

  if (!slug) return <Navigate to="/" replace />;
  if (loading) return <main className="managed-form modal">Loading page settings…</main>;
  if (error || !page) {
    return <main className="managed-form modal">{error || "Page not found"}</main>;
  }
  if (!isEditable) return <Navigate to={`/page/${slug}`} replace />;

  return (
    <PageManagePanel
      page={page}
      owner={page.owner ?? null}
      editors={page.editors ?? []}
      cancelTo={`/page/${slug}`}
      onClose={() => navigate(`/page/${slug}`)}
      onSaveSEO={async seo => {
        await updatePageSEO(page.id, seo);
      }}
      onOwnershipUpdate={() => void refresh(slug)}
    />
  );
}
