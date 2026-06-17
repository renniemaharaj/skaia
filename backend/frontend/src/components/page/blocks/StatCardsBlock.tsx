import type { PageSection, PageItem } from "../types";
import { ICON_MAP } from "../iconMap";
import "./StatCardsBlock.css";
import {
  EditableText,
  SectionToolbar,
  AddItemButton,
  DeleteItemButton,
  IconPicker,
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

export const StatCardsBlock = ({
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
    <section className="stats-section">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Stat Cards"
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
      {(section.heading || canEdit) && (
        <div className="section-header">
          {canEdit ? (
            <>
              <EditableText
                value={section.heading}
                onSave={(v) => onUpdate({ ...section, heading: v })}
                tag="h2"
                placeholder="Section heading (optional)"
              />
              <EditableText
                value={section.subheading}
                onSave={(v) => onUpdate({ ...section, subheading: v })}
                tag="p"
                placeholder="Subheading (optional)"
              />
            </>
          ) : (
            <>
              {section.heading && <h2>{section.heading}</h2>}
              {section.subheading && <p>{section.subheading}</p>}
            </>
          )}
        </div>
      )}
      <div className="stats-container">
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon];
          return (
            <div key={item.id} className="card card--interactive stat-card">
              {canEdit && (
                <DeleteItemButton onClick={() => onItemDelete(item.id)} />
              )}
              <div className="stat-icon">
                {canEdit ? (
                  <IconPicker
                    current={item.icon}
                    onPick={(v) => onItemUpdate({ ...item, icon: v })}
                  />
                ) : Icon ? (
                  <Icon size={32} />
                ) : null}
              </div>
              <div className="stat-text">
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
            </div>
          );
        })}
        {canEdit && (
          <AddItemButton
            onClick={() =>
              onItemCreate(section.id, {
                section_id: section.id,
                display_order: items.length + 1,
                icon: "Star",
                heading: "New Stat",
                subheading: "Value",
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
