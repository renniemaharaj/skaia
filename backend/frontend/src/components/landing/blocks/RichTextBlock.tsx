import { lazy, Suspense, useState } from "react";
import type { LandingSection } from "../types";
import {
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
} from "../EditControls";

/** Lazy-load the heavy editor + viewer to keep the landing bundle small. */
const Editor = lazy(() => import("../../forum/Editor"));
const ViewThread = lazy(() => import("../../forum/ViewThread"));

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
  const content = getContent(section.config);
  const layout = getSectionLayout(section.config);
  const [editing, setEditing] = useState(false);

  const saveContent = (html: string) => {
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
          extra={
            <>
              <button
                className="landing-section-toolbar-btn"
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
            <Editor value={content} onChange={saveContent} />
          </div>
        ) : content ? (
          <div className="richtext-block-viewer">
            <ViewThread content={content} />
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
