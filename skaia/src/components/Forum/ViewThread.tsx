import RichTextEditor from "reactjs-tiptap-editor";
import "reactjs-tiptap-editor/style.css";
import "katex/dist/katex.min.css";
import { useState, useEffect } from "react";
import extensions from "../Editor/extensions";
import { useThemeContext } from "../../hooks/theme/useThemeContext";

function ViewThread({ content }: { content: string }) {
  const [localContent, setLocalContent] = useState(content);
  const { theme } = useThemeContext();
  const [key, setKey] = useState(1);

  useEffect(() => {
    setLocalContent(content);
    setKey((prev) => prev + 1);
  }, [content]);

  return (
    <main>
      <div>
        <div className="blurred-div z-10 renderer-editor">
          <RichTextEditor
            output="html"
            key={key}
            content={localContent as any}
            extensions={extensions}
            dark={theme === "dark"}
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
