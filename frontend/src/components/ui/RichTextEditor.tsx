import { type ChangeEvent, useEffect, useRef, useState } from "react";
import RichTextEditorControl from "reactjs-tiptap-editor";

import "reactjs-tiptap-editor/style.css";
import "prism-code-editor-lightweight/layout.css";
import "prism-code-editor-lightweight/themes/github-dark.css";
import "katex/dist/katex.min.css";
import "easydrawer/styles.css";
import "react-image-crop/dist/ReactCrop.css";
import "../forum/Editor.css";

import { useThemeContext } from "../../hooks/theme/useThemeContext";
import extensions from "../forum/extensions";

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  minHeight?: string;
}

export function RichTextEditor({ value, onChange, minHeight }: RichTextEditorProps) {
  const [localContent, setLocalContent] = useState(value || "");
  const { theme } = useThemeContext();
  const [editorKey, setEditorKey] = useState(1);
  const previousValue = useRef(value);
  const onChangeRef = useRef(onChange);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (value === "" && previousValue.current !== "") {
      setLocalContent("");
      setEditorKey(key => key + 1);
    } else if (value !== previousValue.current) {
      setLocalContent(value || "");
    }
    previousValue.current = value;
  }, [value]);

  const update = (content: string) => {
    setLocalContent(content);
    onChangeRef.current(content);
  };

  const loadHTML = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      update(String(reader.result ?? ""));
      setEditorKey(key => key + 1);
    };
    reader.onerror = () => console.error("Failed to load HTML file");
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <main
      className="editor-wrapper"
      style={{ "--editor-min-height": minHeight || "200px" } as React.CSSProperties}
    >
      <div className="editor-toolbar">
        <button type="button" className="import-html-btn" onClick={() => fileInputRef.current?.click()}>
          Import HTML
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="text/html,.html"
          onChange={loadHTML}
          hidden
        />
      </div>
      <RichTextEditorControl
        output="html"
        key={editorKey}
        content={localContent}
        onChangeContent={update}
        extensions={extensions}
        dark={theme === "dark"}
      />
    </main>
  );
}

export default RichTextEditor;
