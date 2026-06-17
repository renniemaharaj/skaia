import type { PageSection, PageItem } from "../types";
import "./EventHighlightsBlock.css";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
  ImagePickerButton,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  getSectionAnimationIntensity,
  setSectionAnimation,
  setSectionAnimationIntensity,
} from "../EditControls";

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
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
          margins={getSectionMargins(section.config)}
          onMarginsChange={(m) =>
            onUpdate({
              ...section,
              config: setSectionMargins(section.config, m),
            })
          }
          animation={getSectionAnimation(section.config)}
          onAnimationChange={(a) =>
            onUpdate({
              ...section,
              config: setSectionAnimation(section.config, a),
            })
          }
          animationIntensity={getSectionAnimationIntensity(section.config)}
          onAnimationIntensityChange={(i) =>
            onUpdate({
              ...section,
              config: setSectionAnimationIntensity(section.config, i),
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
                    className="pb-action-btn-abs"
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
