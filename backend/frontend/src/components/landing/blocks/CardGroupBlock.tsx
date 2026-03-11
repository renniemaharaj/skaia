import type { LandingSection, LandingItem } from "../types";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
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

export const CardGroupBlock = ({
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
    <section className="community-legacy">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Card Group"
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
      <div className="community-info">
        {items.map((item) => (
          <div key={item.id} className="info-card">
            {canEdit && (
              <DeleteItemButton onClick={() => onItemDelete(item.id)} />
            )}
            {canEdit ? (
              <>
                <EditableText
                  value={item.heading}
                  onSave={(v) => onItemUpdate({ ...item, heading: v })}
                  tag="h3"
                />
                <EditableText
                  value={item.subheading}
                  onSave={(v) => onItemUpdate({ ...item, subheading: v })}
                  tag="p"
                />
              </>
            ) : (
              <>
                <h3>{item.heading}</h3>
                <p>{item.subheading}</p>
              </>
            )}
          </div>
        ))}
        {canEdit && (
          <AddItemButton
            onClick={() =>
              onItemCreate(section.id, {
                section_id: section.id,
                display_order: items.length + 1,
                icon: "",
                heading: "New Card",
                subheading: "Description here",
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
