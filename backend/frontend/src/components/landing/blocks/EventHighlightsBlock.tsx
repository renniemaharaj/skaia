import type { LandingSection, LandingItem } from "../types";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
  ImagePickerButton,
  getSectionLayout,
  setSectionLayout,
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

export const EventHighlightsBlock = ({
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
    <section className="event-highlights">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Event Highlights"
          layout={getSectionLayout(section.config)}
          onLayoutChange={(nextLayout) =>
            onUpdate({
              ...section,
              config: setSectionLayout(section.config, nextLayout),
            })
          }
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

      <div className="event-highlights-grid">
        {items.map((item) => (
          <div key={item.id} className="event-highlight-card">
            <div className="event-highlight-image">
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
            </div>
            <div className="event-highlight-body">
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
                  {item.heading && <h3>{item.heading}</h3>}
                  {item.subheading && <p>{item.subheading}</p>}
                </>
              )}
            </div>
          </div>
        ))}
        {canEdit && (
          <AddItemButton
            label="Add highlight"
            onClick={() =>
              onItemCreate(section.id, {
                section_id: section.id,
                display_order: items.length + 1,
                icon: "",
                heading: "Event Title",
                subheading: "Event description here",
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
