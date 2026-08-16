import "reactjs-tiptap-editor/style.css";
import "prism-code-editor-lightweight/layout.css";
import "prism-code-editor-lightweight/themes/github-dark.css";
import "katex/dist/katex.min.css";
import "easydrawer/styles.css";
import "react-image-crop/dist/ReactCrop.css";
import "./Editor.css";
import { RichTextRenderer } from "../ui/RichTextRenderer";

function ViewThread({ content }: { content: string }) {
  return (
    <main>
      <div>
        <div />
        <div className="blurred-div z-10 renderer-editor">
          <RichTextRenderer
            className="ProseMirror"
            html={typeof content === "string" ? content : String(content ?? "")}
          />
        </div>
      </div>
    </main>
  );
}

export default ViewThread;
