import React from "react";
import type { CardTemplate } from "../types";
import { migrateCardTemplate } from "../types";

export const DesignedCardWrapper = ({
  template: rawTemplate,
  children,
}: {
  template?: CardTemplate;
  children: React.ReactNode;
}) => {
  if (!rawTemplate) return <>{children}</>;
  const template = migrateCardTemplate(rawTemplate);
  const {
    minHeight,
    maxHeight,
    aspectRatio,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    borderRadius,
    cardStyle,
    overflow,
    contentAlign,
  } = template;

  const styleClass =
    cardStyle && cardStyle !== "default" ? ` dcard--${cardStyle}` : "";
  const customCssClass = template.customCss ? " dcard--custom-css" : "";

  const cardCss: React.CSSProperties = {
    minHeight: minHeight ? `${minHeight}px` : undefined,
    maxHeight: maxHeight ? `${maxHeight}px` : undefined,
    aspectRatio:
      aspectRatio && aspectRatio !== "auto" ? aspectRatio : undefined,
    borderRadius: `${borderRadius ?? 16}px`,
    overflow: overflow ?? "hidden",
    margin: `${template.marginTop ?? 0}px ${template.marginRight ?? 0}px ${template.marginBottom ?? 0}px ${template.marginLeft ?? 0}px`,
    padding: `${paddingTop ?? 0}px ${paddingRight ?? 16}px ${paddingBottom ?? 16}px ${paddingLeft ?? 16}px`,
    justifyContent: contentAlign === "stretch" ? undefined : contentAlign,
    alignItems: contentAlign === "stretch" ? "stretch" : undefined,
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div
      className={`dcard card card--interactive dcard--${template.cardWidth}${styleClass}${customCssClass}`}
      style={cardCss}
    >
      {template.customCss ? <style>{template.customCss}</style> : null}
      {children}
    </div>
  );
};
