import type { ReactNode } from "react";
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
        <div
          key={index}
          className={`image-card-item image-card-item--${width}`}
        >
          <div className="image-card-image">
            {item.image_url ? (
              <img src={item.image_url} alt={item.heading ?? ""} />
            ) : item.icon ? (
              <div className="image-card-placeholder">
                {typeof item.icon === "string" ? (
                  <span className="image-card-placeholder-text">
                    {item.icon}
                  </span>
                ) : (
                  item.icon
                )}
              </div>
            ) : (
              <div className="image-card-placeholder" />
            )}
          </div>
          <div className="image-card-body">
            {item.icon && item.image_url && (
              <span className="image-card-icon">{item.icon}</span>
            )}
            {item.heading && (
              <h3 className="image-card-heading">{item.heading}</h3>
            )}
            {item.subheading && (
              <p className="image-card-subheading">{item.subheading}</p>
            )}
            {item.link_url && (
              <span className="image-card-link">{item.link_url}</span>
            )}
          </div>
        </div>
      );
    })}
  </div>
);
