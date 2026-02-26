import RichTextEditor from "reactjs-tiptap-editor";
import "reactjs-tiptap-editor/style.css";
import "prism-code-editor-lightweight/layout.css";
import "prism-code-editor-lightweight/themes/github-dark.css";
import "katex/dist/katex.min.css";
import "easydrawer/styles.css";
import "react-image-crop/dist/ReactCrop.css";
import { useEffect, useState } from "react";
import "./Editor.css";
import extensions from "./extensions";
function ViewThread({ content }: { content: string }) {
  const [localContent, setLocalContent] = useState(content);
  const [key, setKey] = useState(1);
  useEffect(() => {
    setLocalContent(content);
    setKey((prev) => prev + 1);
  }, [content]);

  return (
    <main>
      <div>
        <div />
        <div className="blurred-div z-10 renderer-editor">
          <RichTextEditor
            output="html"
            key={key}
            content={localContent as any}
            extensions={extensions}
            //   dark={theme === "dark"}
            dark={false}
            disableBubble
            hideBubble
            removeDefaultWrapper
            hideToolbar
            disabled
          />
        </div>
      </div>
    </main>
  );
}

export default ViewThread;
