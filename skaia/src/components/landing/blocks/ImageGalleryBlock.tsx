import type { LandingSection, LandingItem } from "../types";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
  ImagePickerButton,
} from "../EditControls";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onItemUpdate: (item: LandingItem) => void;
  onItemDelete: (id: number) => void;
}

export const ImageGalleryBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
  onItemCreate,
  onItemUpdate,
  onItemDelete,
}: Props) => {
  const items = section.items ?? [];

  return (
    <section className="showcase">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Image Gallery"
        />
      )}
      <div className="section-header">
        {canEdit ? (
          <>
            <EditableText
              value={section.heading}
              onSave={(v) => onUpdate({ ...section, heading: v })}
              tag="h2"
            />
            <EditableText
              value={section.subheading}
              onSave={(v) => onUpdate({ ...section, subheading: v })}
              tag="p"
            />
          </>
        ) : (
          <>
            {section.heading && <h2>{section.heading}</h2>}
            {section.subheading && <p>{section.subheading}</p>}
          </>
        )}
      </div>
      <div className="showcase-grid">
        {items.map((item) => (
          <div key={item.id} className="showcase-item">
            {canEdit && (
              <>
                <ImagePickerButton
                  onUploaded={(url) =>
                    onItemUpdate({ ...item, image_url: url })
                  }
                  className="landing-action-btn-abs"
                />
                <DeleteItemButton onClick={() => onItemDelete(item.id)} />
              </>
            )}
            <img
              src={item.image_url || "/placeholder.webp"}
              alt={item.heading}
            />
            <div className="showcase-overlay">
              {canEdit ? (
                <EditableText
                  value={item.heading}
                  onSave={(v) => onItemUpdate({ ...item, heading: v })}
                  tag="h3"
                />
              ) : (
                <h3>{item.heading}</h3>
              )}
            </div>
          </div>
        ))}
        {canEdit && (
          <AddItemButton
            label="Add image"
            onClick={() =>
              onItemCreate(section.id, {
                section_id: section.id,
                display_order: items.length + 1,
                icon: "",
                heading: "New Image",
                subheading: "",
                image_url: "",
                link_url: "",
                config: "{}",
              })
            }
          />
        )}
      </div>
    </section>
  );
};
