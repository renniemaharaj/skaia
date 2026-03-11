import { useState, useEffect } from "react";

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
  const [key] = useState(1);

  // Sync external value changes
  useEffect(() => {
    setLocalContent(value || "");
  }, [value]);

  const onValueChange = debounce((newContent: string) => {
    setLocalContent(newContent);
    onChange(newContent);
  }, 300);

  return (
    <main>
      <div>
        <div className="blurred-div !z-40 !pt-10 px-2 md:px-4">
          <RichTextEditor
            output="html"
            key={key}
            content={localContent as any}
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
