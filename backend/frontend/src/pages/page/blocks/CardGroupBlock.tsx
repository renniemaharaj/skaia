import type { PageSection, PageItem } from "../types";
import "./CardGroupBlock.css";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
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
