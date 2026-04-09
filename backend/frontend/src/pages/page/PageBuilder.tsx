import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Settings } from "lucide-react";
import type {
  LandingSection,
  LandingItem,
} from "../../components/landing/types";
import { useLandingData } from "../../hooks/useLandingData";
import { usePageData } from "../../hooks/usePageData";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import type { PageBuilderPage } from "../../hooks/usePageData";
import { LandingSkeleton } from "../../components/landing/LandingSkeleton";
import { BlockRenderer } from "../../components/landing/BlockRenderer";

interface PageBuilderProps {
  /** Optional slug to load. Falls back to the URL :slug param, then index. */
  slug?: string;
}

export default function PageBuilder(props: PageBuilderProps = {}) {
  const params = useParams<{ slug?: string }>();
  const slug = props.slug ?? params.slug;
  const { page, loading, error, refresh, isEditable, updatePage, createPage } =
    usePageData();
  const {
    sections: landingSections,
    loading: landingLoading,
    updateSection,
    createSection,
    deleteSection,
    reorderSections,
    createItem,
    updateItem,
    deleteItem,
  } = useLandingData();

  const guestSandboxDetected = useGuestSandboxMode();
  const [guestSandboxEnabled, setGuestSandboxEnabled] =
    useState(guestSandboxDetected);
  useEffect(() => {
    setGuestSandboxEnabled(guestSandboxDetected);
  }, [guestSandboxDetected]);

  const [sections, setSections] = useState<LandingSection[]>([]);
  const guestSandboxMode = isEditable || guestSandboxEnabled;
  const canEdit = guestSandboxMode;

  // Track whether the page needs to be created (404 + editable or sandbox enabled).
  const isNewPage = !!(slug && error && guestSandboxMode);
  const pageRef = useRef<PageBuilderPage | null>(page);
  pageRef.current = page;

  /**
   * Ensure the page entity exists in the backend, creating it on the fly if
   * we're on a 404 slug the user has permission to build.
   */
  const ensurePage = useCallback(
    async (content: LandingSection[]): Promise<PageBuilderPage | null> => {
      if (pageRef.current) return pageRef.current;
      if (!slug) return null;
      const created = await createPage({
        slug,
        title: slug,
        description: "",
        is_index: false,
        content: JSON.stringify(content),
      });
      await refresh(slug);
      return created;
    },
    [slug, createPage, refresh],
  );

  useEffect(() => {
    if (page?.content) {
      try {
        const parsed = JSON.parse(page.content);
        if (Array.isArray(parsed)) {
          setSections(sortSections(parsed));
          return;
        }
      } catch {
        // invalid JSON
      }
    }
    setSections(sortSections(landingSections));
  }, [page?.content, landingSections]);

  useEffect(() => {
    refresh(slug);
  }, [refresh, slug]);

  // Only fall back to the per-section landing API when we're on the index
  // page and no page entity exists for it yet.  Custom-page slugs always use
  // the page-content JSON approach (ensurePage will auto-create if needed).
  const isPageFallback = (!page || !!error) && !slug;

  const sortSections = (secs: LandingSection[]) =>
    [...secs].sort((a, b) => a.display_order - b.display_order);

  const savePageContent = async (updatedSections: LandingSection[]) => {
    // If the page doesn't exist yet, create it with the initial content.
    if (!pageRef.current || pageRef.current.id == null) {
      await ensurePage(updatedSections);
      return;
    }
    const saved = await updatePage({
      ...pageRef.current,
      content: JSON.stringify(updatedSections),
    });
    // Keep the ref in sync so subsequent saves don't use stale content.
    if (saved) {
      pageRef.current = saved;
    }
  };

  const updateSectionWrapper = (s: LandingSection) => {
    if (isPageFallback) {
      updateSection(s);
      return;
    }
    const updated = sections.map((sec) => (sec.id === s.id ? s : sec));
    const ordered = sortSections(updated);
    setSections(ordered);
    void savePageContent(ordered);
  };

  const createSectionWrapper = (s: Omit<LandingSection, "id">) => {
    if (isPageFallback) {
      createSection(s);
      return;
    }

    const sorted = sortSections(sections);
    const newSection: LandingSection = { ...s, id: Date.now() };

    const insertionIndex = Math.max(
      0,
      Math.min(
        sorted.length,
        typeof s.display_order === "number"
          ? s.display_order - 1
          : sorted.length,
      ),
    );

    const updated = [...sorted];
    updated.splice(insertionIndex, 0, newSection);

    const normalized = updated.map((section, idx) => ({
      ...section,
      display_order: idx + 1,
    }));

    setSections(normalized);
    void savePageContent(normalized);
  };

  const deleteSectionWrapper = (id: number) => {
    if (isPageFallback) {
      deleteSection(id);
      return;
    }
    const updated = sections.filter((section) => section.id !== id);
    const ordered = sortSections(updated);
    setSections(ordered);
    void savePageContent(ordered);
  };

  const createItemWrapper = (
    sectionId: number,
    item: Omit<LandingItem, "id">,
  ) => {
    if (isPageFallback) {
      createItem(sectionId, item);
      return;
    }
    const updated = sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }
      const items = section.items ?? [];
      return {
        ...section,
        items: [...items, { ...item, id: Date.now() }],
      };
    });
    const ordered = sortSections(updated);
    setSections(ordered);
    void savePageContent(ordered);
  };

  const updateItemWrapper = (item: LandingItem) => {
    if (isPageFallback) {
      updateItem(item);
      return;
    }
    const updated = sections.map((section) => {
      if (!section.items) return section;
      return {
        ...section,
        items: section.items.map((it) => (it.id === item.id ? item : it)),
      };
    });
    const ordered = sortSections(updated);
    setSections(ordered);
    void savePageContent(ordered);
  };

  const deleteItemWrapper = (id: number) => {
    if (isPageFallback) {
      deleteItem(id);
      return;
    }
    const updated = sections.map((section) => {
      if (!section.items) return section;
      return {
        ...section,
        items: section.items.filter((item) => item.id !== id),
      };
    });
    const ordered = sortSections(updated);
    setSections(ordered);
    void savePageContent(ordered);
  };

  const moveSectionWrapper = async (
    sourceSectionId: number,
    targetSectionId: number,
  ) => {
    const sorted = sortSections(sections);
    const sourceIdx = sorted.findIndex((sec) => sec.id === sourceSectionId);
    const targetIdx = sorted.findIndex((sec) => sec.id === targetSectionId);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

    const next = [...sorted];
    const [moving] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moving);

    const normalized = next.map((section, idx) => ({
      ...section,
      display_order: idx + 1,
    }));

    setSections(normalized);

    if (isPageFallback) {
      // Use the atomic reorder endpoint instead of individual section updates
      // so display_order is persisted in a single transaction.
      await reorderSections(normalized.map((s) => s.id));
    } else {
      await savePageContent(normalized);
    }
  };

  if (loading || (slug === undefined && landingLoading)) {
    return (
      <div className="landing-container">
        <LandingSkeleton />
      </div>
    );
  }

  if (slug && error && !canEdit) {
    return (
      <div className="landing-container">
        <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <p style={{ color: "var(--color-danger, #e74c3c)" }}>
            Page not found: {error}
          </p>
        </div>
      </div>
    );
  }

  if (isNewPage) {
    return (
      <div className="landing-container">
        <div style={{ textAlign: "center", padding: "3rem 1rem 1rem" }}>
          <p style={{ opacity: 0.6 }}>
            This page doesn&apos;t exist yet. Start building to create it.
          </p>
        </div>
        <BlockRenderer
          sections={[]}
          canEdit
          onUpdateSection={updateSectionWrapper}
          onDeleteSection={deleteSectionWrapper}
          onCreateSection={createSectionWrapper}
          onCreateItem={createItemWrapper}
          onUpdateItem={updateItemWrapper}
          onDeleteItem={deleteItemWrapper}
          onMoveSection={moveSectionWrapper}
        />
      </div>
    );
  }

  return (
    <div className="landing-container">
      {(!slug || isEditable) && (
        <div className="page-admin-bar">
          {isEditable && !slug && (
            <Link to="/admin/meta" className="page-admin-btn">
              <Settings size={16} />
              Site Meta
            </Link>
          )}
          {!isEditable && !slug && (
            <div
              className={`guest-sandbox${guestSandboxEnabled ? " active" : ""}`}
            >
              <button
                type="button"
                className={`page-admin-btn guest-sandbox-btn${
                  guestSandboxEnabled ? " active" : ""
                }`}
                onClick={() => setGuestSandboxEnabled((current) => !current)}
                title="Toggle guest sandbox mode"
              >
                <Settings size={16} />
                Sandbox
              </button>
            </div>
          )}
        </div>
      )}
      <BlockRenderer
        sections={sections}
        canEdit={canEdit}
        onUpdateSection={updateSectionWrapper}
        onDeleteSection={deleteSectionWrapper}
        onCreateSection={createSectionWrapper}
        onCreateItem={createItemWrapper}
        onUpdateItem={updateItemWrapper}
        onDeleteItem={deleteItemWrapper}
        onMoveSection={moveSectionWrapper}
      />
      {guestSandboxEnabled && (
        <div className="guest-sandbox guest-sandbox-watermark">
          Site is in guest sandbox mode for you, most things will fail, but you
          can play around and explore!
        </div>
      )}
    </div>
  );
}
