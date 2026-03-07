import type { LandingSection, LandingItem } from "../types";
import { ICON_MAP } from "../iconMap";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
  IconPicker,
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

export const FeatureGridBlock = ({
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
    <section className="features">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Feature Grid"
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
      <div className="features-grid">
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon];
          return (
            <div key={item.id} className="feature-card">
              {canEdit && (
                <DeleteItemButton onClick={() => onItemDelete(item.id)} />
              )}
              <div className="feature-icon">
                {canEdit ? (
                  <IconPicker
                    current={item.icon}
                    onPick={(v) => onItemUpdate({ ...item, icon: v })}
                  />
                ) : Icon ? (
                  <Icon size={24} />
                ) : null}
              </div>
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
          );
        })}
        {canEdit && (
          <AddItemButton
            label="Add feature"
            onClick={() =>
              onItemCreate(section.id, {
                section_id: section.id,
                display_order: items.length + 1,
                icon: "Star",
                heading: "New Feature",
                subheading: "Feature description",
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
