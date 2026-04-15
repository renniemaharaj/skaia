import { lazy, Suspense, useState, useEffect } from "react";
import type { LandingSection } from "../types";
import { usePageBuilderContext } from "../PageBuilderContext";
import "./RichTextBlock.css";
import {
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  setSectionAnimation,
} from "../EditControls";

/** Lazy-load the heavy editor + viewer to keep the landing bundle small. */
const Editor = lazy(() => import("../../../components/forum/Editor"));
const ViewThread = lazy(() => import("../../../components/forum/ViewThread"));

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

/** Parse the rich text HTML from section config. */
function getContent(config: string): string {
  try {
    const parsed = JSON.parse(config || "{}");
    const content = parsed.content;
    if (typeof content === "string") return content;
    if (content != null) return JSON.stringify(content);
    return "";
  } catch {
    return "";
  }
}

export const RichTextBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const { enterEdit, leaveEdit } = usePageBuilderContext();
  // Hold saves in PageBuilder while this editor is active.
  useEffect(() => {
    if (!editing) return;
    enterEdit();
    return () => leaveEdit();
    // enterEdit/leaveEdit are stable useCallback refs — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  // Derive content from props only when not editing; local state insulates the
  // editor from parent re-renders (e.g. color slider on another block).
  const [localContent, setLocalContent] = useState(() =>
    getContent(section.config),
  );
  useEffect(() => {
    if (!editing) setLocalContent(getContent(section.config));
  }, [section.config, editing]);

  const layout = getSectionLayout(section.config);

  const saveContent = (html: string) => {
    setLocalContent(html);
    const c = JSON.parse(section.config || "{}");
    onUpdate({ ...section, config: JSON.stringify({ ...c, content: html }) });
  };

  return (
    <section className="richtext-block">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Rich Text"
          layout={layout}
          onLayoutChange={(nextLayout) =>
            onUpdate({
              ...section,
              config: setSectionLayout(section.config, nextLayout),
            })
          }
          margins={getSectionMargins(section.config)}
          onMarginsChange={(m) =>
            onUpdate({
              ...section,
              config: setSectionMargins(section.config, m),
            })
          }
          animation={getSectionAnimation(section.config)}
          onAnimationChange={(a) =>
            onUpdate({
              ...section,
              config: setSectionAnimation(section.config, a),
            })
          }
          extra={
            <>
              <button
                className="pb-section-toolbar-btn"
                onClick={() => setEditing(!editing)}
                title={editing ? "Preview" : "Edit content"}
              >
                {editing ? "Preview" : "Edit"}
              </button>
            </>
          }
        />
      )}

      <Suspense
        fallback={
          <div
            className="skeleton-bar"
            style={{ height: 200, borderRadius: 12 }}
          />
        }
      >
        {canEdit && editing ? (
          <div className="richtext-block-editor">
            <Editor value={localContent} onChange={saveContent} />
          </div>
        ) : localContent ? (
          <div className="richtext-block-viewer">
            <ViewThread content={localContent} />
          </div>
        ) : canEdit ? (
          <div
            className="richtext-block-empty"
            onClick={() => setEditing(true)}
          >
            <p>Click "Edit" to add rich text content…</p>
          </div>
        ) : null}
      </Suspense>
    </section>
  );
};
