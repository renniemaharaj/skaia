import { useState, useEffect, useRef, type ChangeEvent } from "react";

import RichTextEditor from "reactjs-tiptap-editor";

import "reactjs-tiptap-editor/style.css";
import "prism-code-editor-lightweight/layout.css";
import "prism-code-editor-lightweight/themes/github-dark.css";

import "katex/dist/katex.min.css";
import "easydrawer/styles.css";
import "react-image-crop/dist/ReactCrop.css";
import "./Editor.css";
// import { useSetAtom } from "jotai";
import { debounce } from "lodash";
// import { useThemeContext } from "../context/theme/useThemeContext";
import extensions from "./extensions";
import { useThemeContext } from "../../hooks/theme/useThemeContext";

interface EditorProps {
  value: string;
  onChange: (content: string) => void;
}

function Editor({ value, onChange }: EditorProps) {
  const [localContent, setLocalContent] = useState(value || "");
  const { theme } = useThemeContext();
  const [editorKey, setEditorKey] = useState(1);

  // Sync external value changes
  useEffect(() => {
    setLocalContent(value || "");
  }, [value]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onValueChange = debounce((newContent: string) => {
    setLocalContent(newContent);
    onChange(newContent);
  }, 300);

  const importHtmlFile = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const importedHtml = reader.result as string;
      setLocalContent(importedHtml);
      onChange(importedHtml);
      setEditorKey((k) => k + 1); // force rerender so editor refreshes with imported content
    };
    reader.onerror = () => {
      console.error("Failed to load HTML file");
    };
    reader.readAsText(file);

    // Reset so same file can be re-loaded later if needed.
    event.target.value = "";
  };

  return (
    <main>
      <div className="editor-toolbar">
        <button
          type="button"
          className="import-html-btn"
          onClick={importHtmlFile}
        >
          Import HTML
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="text/html,.html"
          onChange={onFileChange}
          style={{ display: "none" }}
        />
      </div>
      <div>
        <div className="blurred-div !z-40 !pt-10 px-2 md:px-4">
          <RichTextEditor
            output="html"
            key={editorKey}
            content={
              typeof localContent === "string"
                ? localContent
                : String(localContent ?? "")
            }
            onChangeContent={onValueChange}
            extensions={extensions}
            dark={theme === "dark"}
          />
        </div>
      </div>
    </main>
  );
}

export default Editor;
