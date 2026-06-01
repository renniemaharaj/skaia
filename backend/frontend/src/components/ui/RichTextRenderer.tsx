import React from "react";
import parse, { type DOMNode, Element } from "html-react-parser";
import DOMPurify from "dompurify";
import UserLink from "../user/UserLink";

interface RichTextRendererProps {
  html: string;
  className?: string;
  previewMode?: boolean;
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  html,
  className = "",
  previewMode = false,
}) => {
  // Sanitize HTML
  const sanitized = DOMPurify.sanitize(html);

  const options = {
    replace: (domNode: DOMNode) => {
      if (previewMode && domNode instanceof Element && /^h[1-6]$/i.test(domNode.name)) {
        if (domNode.attribs && domNode.attribs.id) {
          delete domNode.attribs.id;
        }
      }

      if (
        domNode instanceof Element &&
        domNode.name === "span" &&
        domNode.attribs["data-type"] === "mention"
      ) {
        const id = domNode.attribs["data-id"] || domNode.attribs["id"];
        const label = domNode.attribs["data-label"] || domNode.attribs["label"] ||
          (domNode.children && domNode.children[0]
            ? (domNode.children[0] as any).data
            : "");
        // const type = domNode.attribs["data-mention-type"] || "user"; // Assume user by default, or maybe id has 'role-' prefix

        let badgeClass = "mention-badge";
        let text = `@${label || id}`;

        if (id === "special-here" || id === "special-everyone") {
          badgeClass += " mention-special";
          text = `@${id.replace("special-", "")}`;
        } else if (typeof id === "string" && id.startsWith("role-")) {
          badgeClass += " mention-role";
        } else if (typeof id === "string" && id.startsWith("user-")) {
          badgeClass += " mention-user";
        } else {
          badgeClass += " mention-user";
        }

        // You can make this interactive (e.g. UserLink)
        if (typeof id === "string" && id.startsWith("user-")) {
          const userId = id.replace("user-", "");
          return (
            <span className={badgeClass}>
              <UserLink userId={userId} displayName={text} />
            </span>
          );
        }

        return (
          <span className={badgeClass}>
            {text}
          </span>
        );
      }
    },
  };

  return (
    <div className={`rich-text-renderer ${className}`}>
      {parse(sanitized, options)}
    </div>
  );
};
