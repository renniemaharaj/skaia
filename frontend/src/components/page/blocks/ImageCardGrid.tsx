import type { ReactNode } from "react";
import { ContentFlatCard } from "../../cards/ContentFlatCard";
import { MediaPlaceholder } from "../../ui/MediaPlaceholder";
import "./ImageCardGrid.css";

export type CardWidth = "narrow" | "regular" | "wide" | "halfway" | "full";

export interface ImageCardItem {
  heading?: string;
  subheading?: string;
  image_url?: string;
  icon?: string | ReactNode;
  link_url?: string;
  width?: CardWidth;
}

export const ImageCardGrid = ({ items }: { items: ImageCardItem[] }) => (
  <div className="image-card-grid">
    {items.map((item, index) => {
      const width = item.width ?? "regular";
      return (
        <ContentFlatCard key={index} className={`image-card-item image-card-item--${width}`}>
          <div className="image-card-image">
            {item.image_url || !item.icon ? (
              <MediaPlaceholder
                alt={item.heading || "Card image"}
                fit="cover"
                href={item.image_url}
                layout="fill"
                mediaType="image"
                preserveFrame
                showCaption={false}
                size={{ height: "100%", width: "100%" }}
              />
            ) : item.icon ? (
              <div className="image-card-placeholder">
                {typeof item.icon === "string" ? (
                  <span className="image-card-placeholder-text">{item.icon}</span>
                ) : (
                  item.icon
                )}
              </div>
            ) : null}
          </div>
          <div className="image-card-body">
            {item.icon && item.image_url && <span className="image-card-icon">{item.icon}</span>}
            {item.heading && <h3 className="image-card-heading">{item.heading}</h3>}
            {item.subheading && <p className="image-card-subheading">{item.subheading}</p>}
            {item.link_url && <span className="image-card-link">{item.link_url}</span>}
          </div>
        </ContentFlatCard>
      );
    })}
  </div>
);
