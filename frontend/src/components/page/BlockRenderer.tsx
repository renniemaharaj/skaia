import type { PageItem, PageSection, PageTheme, SectionType } from "./types";
import { SECTION_TYPE_GROUPS, SECTION_TYPE_LABELS, canonicalSectionType } from "./types";
import {
  clearInteractiveRecords,
  configForNewSection,
  isInteractiveSectionType,
} from "./interactiveTypes";
import { SectionFrame } from "./SectionFrame";
import { SECTION_RENDERER_REGISTRY, SECTION_RENDERER_TYPES } from "./sectionRendererRegistry";
import "./page-builder-core.css";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";

interface BlockRendererProps {
  sections: PageSection[];
  canEdit: boolean;
  onUpdateSection: (s: PageSection) => void;
  onDeleteSection: (id: number) => void;
  onCreateSection: (s: Omit<PageSection, "id">) => void;
  onCreateItem: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onUpdateItem: (item: PageItem) => void;
  onDeleteItem: (id: number) => void;
  onMoveSection: (sourceSectionId: number, targetSectionId: number) => void;
  pageKey?: string;
  theme?: PageTheme;
}

export const BLOCK_RENDERER_TYPES = SECTION_RENDERER_TYPES;

/**
 * Memoised wrapper for a single section block.  When the parent re-renders
 * (e.g. a WS update changed a *different* section), this component will bail
 * out as long as its props still reference the same objects - which is
 * guaranteed by the `mergeSections` diffing in PageBuilder and the stable
 * `useCallback` wrappers.
 */
interface SectionBlockProps {
  section: PageSection;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (sectionId: number, direction: "up" | "down") => void;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
  onItemDelete: (id: number) => void;
  pageKey?: string;
  theme?: PageTheme;
}

/** Minimal skeleton shown while a heavy block chunk is fetching. */
const SectionBlockSkeleton = () => (
  <div
    className="skeleton"
    style={{ width: "100%", height: 80, borderRadius: 8, margin: "4px 0" }}
  />
);

const SectionBlock = memo(function SectionBlock({
  section,
  canEdit,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
  onItemCreate,
  onItemUpdate,
  onItemDelete,
  pageKey,
  theme,
}: SectionBlockProps) {
  const canonicalType = canonicalSectionType(section.section_type);
  const Block = canonicalType ? SECTION_RENDERER_REGISTRY[canonicalType].component : null;
  if (!Block) {
    return (
      <SectionFrame
        section={section}
        isFirst={isFirst}
        isLast={isLast}
        canEdit={canEdit}
        onMove={onMove}
        onUpdate={onUpdate}
        onDelete={onDelete}
        pageKey={pageKey}
        theme={theme}
      >
        <section
          className="pb-section-unsupported"
          role="alert"
          data-section-type={section.section_type}
        >
          <div>
            <strong>Unsupported section</strong>
            <span>
              Section type <code>{section.section_type || "(missing)"}</code> is not registered.
            </span>
          </div>
        </section>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame
      section={section}
      isFirst={isFirst}
      isLast={isLast}
      canEdit={canEdit}
      onMove={onMove}
      onUpdate={onUpdate}
      onDelete={onDelete}
      pageKey={pageKey}
      theme={theme}
      fallback={<SectionBlockSkeleton />}
    >
      <Block
        section={section}
        canEdit={canEdit}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onItemCreate={onItemCreate}
        onItemUpdate={onItemUpdate}
        onItemDelete={onItemDelete}
      />
    </SectionFrame>
  );
});

export const BlockRenderer = memo(function BlockRenderer({
  sections,
  canEdit,
  onUpdateSection,
  onDeleteSection,
  onCreateSection,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onMoveSection,
  pageKey,
  theme,
}: BlockRendererProps) {
  const [activeAddIndex, setActiveAddIndex] = useState<number | null>(null);

  const addSection = (type: SectionType, insertIndex: number) => {
    onCreateSection({
      display_order: insertIndex + 1,
      section_type: type,
      heading: SECTION_TYPE_LABELS[type] ?? type,
      subheading: "",
      config: configForNewSection(type),
      items: [],
    });
    setActiveAddIndex(null);
  };

  const orderedSections = [...sections].sort((a, b) => a.display_order - b.display_order);

  // Helper for pasting
  const onCreateSectionRef = useRef(onCreateSection);
  onCreateSectionRef.current = onCreateSection;

  useEffect(() => {
    if (!canEdit) return;
    const handlePaste = async (e: ClipboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      try {
        const text = e.clipboardData?.getData("text") || (await navigator.clipboard.readText());
        if (!text) return;
        const parsed = JSON.parse(text);
        if (parsed.isSkaiaBlock && parsed.section) {
          e.preventDefault();
          const targetIndex = activeAddIndex !== null ? activeAddIndex : orderedSections.length;

          const newSection: Omit<PageSection, "id"> = {
            display_order: targetIndex + 1,
            section_type: parsed.section.section_type,
            heading: parsed.section.heading,
            subheading: parsed.section.subheading,
            config: isInteractiveSectionType(parsed.section.section_type)
              ? clearInteractiveRecords(parsed.section.config)
              : parsed.section.config,
            items: (parsed.section.items || []).map((item: any) => {
              const { id, section_id, ...rest } = item;
              return rest;
            }),
          };

          onCreateSectionRef.current(newSection);
          toast.success("Section pasted from clipboard!");
        }
      } catch {
        // Not a valid JSON block, ignore silently
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [canEdit, activeAddIndex, orderedSections.length]);

  // Stable move handler - uses refs so the callback identity never changes.
  const sectionsRef = useRef(orderedSections);
  sectionsRef.current = orderedSections;
  const onMoveSectionRef = useRef(onMoveSection);
  onMoveSectionRef.current = onMoveSection;

  const handleMove = useCallback((sectionId: number, direction: "up" | "down") => {
    const secs = sectionsRef.current;
    const idx = secs.findIndex(s => s.id === sectionId);
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= secs.length) return;
    onMoveSectionRef.current(sectionId, secs[neighborIdx].id);
  }, []);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [clipboardSection, setClipboardSection] = useState<any | null>(null);

  const checkClipboardForSection = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setClipboardSection(null);
        return;
      }
      const parsed = JSON.parse(text);
      if (parsed.isSkaiaBlock && parsed.section) {
        setClipboardSection(parsed.section);
      } else {
        setClipboardSection(null);
      }
    } catch {
      setClipboardSection(null);
    }
  };

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const renderAddSectionTrigger = (insertIndex: number) => (
    <div className="pb-add-section" key={`add-section-${insertIndex}`}>
      <button
        className="pb-add-section-btn"
        onClick={() => {
          if (activeAddIndex === insertIndex) {
            setActiveAddIndex(null);
          } else {
            setActiveAddIndex(insertIndex);
            checkClipboardForSection();
          }
        }}
      >
        <Plus size={18} /> Add Section
      </button>

      {activeAddIndex === insertIndex && (
        <div className="pb-add-section-menu">
          {clipboardSection && (
            <div className="pb-add-section-group" key="paste-section-btn">
              <button
                type="button"
                className="pb-add-section-group-header"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px dashed var(--primary)",
                }}
                onClick={() => {
                  const newSection: Omit<PageSection, "id"> = {
                    display_order: insertIndex + 1,
                    section_type: clipboardSection.section_type,
                    heading: clipboardSection.heading,
                    subheading: clipboardSection.subheading,
                    config: isInteractiveSectionType(clipboardSection.section_type)
                      ? clearInteractiveRecords(clipboardSection.config)
                      : clipboardSection.config,
                    items: (clipboardSection.items || []).map((item: any) => {
                      const { id, section_id, ...rest } = item;
                      return rest;
                    }),
                  };
                  onCreateSectionRef.current(newSection);
                  setActiveAddIndex(null);
                  setClipboardSection(null);
                  toast.success("Section pasted successfully!");
                }}
              >
                <div>
                  <div className="pb-add-section-group-label" style={{ color: "var(--primary)" }}>
                    Paste Section Here
                  </div>
                  <div className="pb-add-section-group-desc">
                    Paste copied{" "}
                    {SECTION_TYPE_LABELS[clipboardSection.section_type] ??
                      clipboardSection.section_type}{" "}
                    block
                  </div>
                </div>
              </button>
            </div>
          )}
          {SECTION_TYPE_GROUPS.map(group => (
            <div className="pb-add-section-group" key={group.id}>
              <button
                type="button"
                className="pb-add-section-group-header"
                onClick={() => toggleGroup(group.id)}
              >
                <div>
                  <div className="pb-add-section-group-label">{group.label}</div>
                  {group.description && (
                    <div className="pb-add-section-group-desc">{group.description}</div>
                  )}
                </div>
                <span className="pb-add-section-group-toggle">
                  {openGroups.has(group.id) ? "−" : "+"}
                </span>
              </button>

              {openGroups.has(group.id) && (
                <div className="pb-add-section-group-items">
                  {group.types.map(type => (
                    <button
                      key={type}
                      className="pb-add-section-menu-item"
                      onClick={() => addSection(type, insertIndex)}
                    >
                      {SECTION_TYPE_LABELS[type] ?? type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {canEdit && renderAddSectionTrigger(0)}

      {orderedSections.map((section, i) => {
        const isFirst = i === 0;
        const isLast = i === orderedSections.length - 1;

        return (
          <React.Fragment key={section.id}>
            <SectionBlock
              section={section}
              canEdit={canEdit}
              isFirst={isFirst}
              isLast={isLast}
              onMove={handleMove}
              onUpdate={onUpdateSection}
              onDelete={onDeleteSection}
              onItemCreate={onCreateItem}
              onItemUpdate={onUpdateItem}
              onItemDelete={onDeleteItem}
              pageKey={pageKey}
              theme={theme}
            />
            {canEdit && renderAddSectionTrigger(i + 1)}
          </React.Fragment>
        );
      })}
    </>
  );
});
