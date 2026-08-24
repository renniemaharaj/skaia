import { useField } from "formik";
import { useMemo } from "react";
import { BlockRenderer } from "./BlockRenderer";
import { PageBuilderContext } from "./PageBuilderContext";
import type { PageDocumentID, PageItem, PageSection } from "./types";

function nextDocumentID() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parsePageDocument(value: unknown): PageSection[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PageSection[]) : [];
  } catch {
    return [];
  }
}

export function isPageDocument(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

export function PageDocumentField({ name, label }: { name: string; label: string }) {
  const [field, , helpers] = useField<string>(name);
  const sections = useMemo(() => parsePageDocument(field.value), [field.value]);
  const commit = (next: PageSection[]) => helpers.setValue(JSON.stringify(next));
  const normalized = (next: PageSection[]) =>
    next.map((section, index) => ({ ...section, display_order: index + 1 }));

  const updateSection = (updated: PageSection) =>
    commit(sections.map(section => (section.id === updated.id ? updated : section)));
  const deleteSection = (id: PageDocumentID) =>
    commit(normalized(sections.filter(section => section.id !== id)));
  const createSection = (section: Omit<PageSection, "id">) => {
    const insertionIndex = Math.max(
      0,
      Math.min(sections.length, Number(section.display_order) - 1 || sections.length)
    );
    const next = [...sections];
    next.splice(insertionIndex, 0, { ...section, id: nextDocumentID() });
    commit(normalized(next));
  };
  const createItem = (sectionID: PageDocumentID, item: Omit<PageItem, "id">) =>
    commit(
      sections.map(section =>
        section.id === sectionID
          ? {
              ...section,
              items: [
                ...(section.items ?? []),
                { ...item, id: nextDocumentID(), section_id: sectionID },
              ],
            }
          : section
      )
    );
  const updateItem = (updated: PageItem) =>
    commit(
      sections.map(section => ({
        ...section,
        items: section.items?.map(item => (item.id === updated.id ? updated : item)),
      }))
    );
  const deleteItem = (id: PageDocumentID) =>
    commit(
      sections.map(section => ({
        ...section,
        items: section.items?.filter(item => item.id !== id),
      }))
    );
  const moveSection = (sourceID: PageDocumentID, targetID: PageDocumentID) => {
    const sourceIndex = sections.findIndex(section => section.id === sourceID);
    const targetIndex = sections.findIndex(section => section.id === targetID);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const next = [...sections];
    const [moving] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moving);
    commit(normalized(next));
  };

  return (
    <section className="page-document-field" aria-label={label}>
      <div className="page-document-field__intro">
        <h3>{label}</h3>
        <p>Build this publication with the same reusable sections available to custom pages.</p>
      </div>
      <BlockRenderer
        sections={sections}
        canEdit
        onUpdateSection={updateSection}
        onDeleteSection={deleteSection}
        onCreateSection={createSection}
        onCreateItem={createItem}
        onUpdateItem={updateItem}
        onDeleteItem={deleteItem}
        onMoveSection={moveSection}
        pageKey={`field:${name}`}
      />
    </section>
  );
}

const noop = () => {};

export function PageDocumentContent({
  value,
  pageKey,
  pageId,
}: { value: string; pageKey: string; pageId?: number }) {
  const sections = useMemo(() => parsePageDocument(value), [value]);
  const context = useMemo(
    () => ({
      editingCount: 0,
      enterEdit: noop,
      leaveEdit: noop,
      saveStatus: "idle" as const,
      pendingIncoming: false,
      pageId,
      canManagePage: false,
    }),
    [pageId]
  );
  if (sections.length === 0) return null;
  return (
    <PageBuilderContext.Provider value={context}>
      <div className="page-document-content">
        <BlockRenderer
          sections={sections}
          canEdit={false}
          onUpdateSection={noop}
          onDeleteSection={noop}
          onCreateSection={noop}
          onCreateItem={noop}
          onUpdateItem={noop}
          onDeleteItem={noop}
          onMoveSection={noop}
          pageKey={pageKey}
        />
      </div>
    </PageBuilderContext.Provider>
  );
}
