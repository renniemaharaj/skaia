import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type {
  LandingSection,
  LandingItem,
} from "../../components/landing/types";
import { useLandingData } from "../../hooks/useLandingData";
import { usePageData } from "../../hooks/usePageData";
import { LandingSkeleton } from "../../components/landing/LandingSkeleton";
import { BlockRenderer } from "../../components/landing/BlockRenderer";

export default function PageBuilder() {
  const { slug } = useParams<{ slug?: string }>();
  const { page, loading, error, refresh, isEditable, updatePage } =
    usePageData();
  const {
    sections: landingSections,
    loading: landingLoading,
    updateSection,
    createSection,
    deleteSection,
    createItem,
    updateItem,
    deleteItem,
  } = useLandingData();

  const [sections, setSections] = useState<LandingSection[]>([]);

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

  const isPageFallback = !page || !!error;

  const sortSections = (secs: LandingSection[]) =>
    [...secs].sort((a, b) => a.display_order - b.display_order);

  const savePageContent = async (updatedSections: LandingSection[]) => {
    if (!page || page.id == null) return;
    await updatePage({
      ...page,
      content: JSON.stringify(updatedSections),
    });
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

  if (loading || (slug === undefined && landingLoading)) {
    return (
      <div className="landing-container">
        <LandingSkeleton />
      </div>
    );
  }

  if (slug && error) {
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

  return (
    <div className="landing-container">
      <BlockRenderer
        sections={sections}
        canEdit={isEditable && !isPageFallback}
        onUpdateSection={updateSectionWrapper}
        onDeleteSection={deleteSectionWrapper}
        onCreateSection={createSectionWrapper}
        onCreateItem={createItemWrapper}
        onUpdateItem={updateItemWrapper}
        onDeleteItem={deleteItemWrapper}
      />
    </div>
  );
}
