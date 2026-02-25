import { useState } from "react";

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

function Editor(value: any) {
  const [localContent, setLocalContent] = useState(value || "");
  // const { theme } = useThemeContext();

  const [key] = useState(1);

  // const triggerRemount = () => setKey((prev) => prev + 1);

  const onValueChange = debounce((value: any) => setLocalContent(value), 300);
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
            dark={false}
            // dark={theme === "dark"}
          />
        </div>
      </div>
    </main>
  );
}

export default Editor;
