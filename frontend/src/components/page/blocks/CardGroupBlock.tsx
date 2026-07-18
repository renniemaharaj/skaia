import { ContentFlatCard } from "../../cards/ContentFlatCard";
import type { PageItem, PageSection } from "../types";
import "./CardGroupBlock.css";
import { AddItemButton, DeleteItemButton, EditableText } from "../EditControls";

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
  onItemCreate,
  onItemUpdate,
  onItemDelete,
}: Props) => {
  const items = section.items ?? [];

  return (
    <section className="community-legacy">
      <div className="section-header">
        {canEdit ? (
          <>
            <EditableText
              value={section.heading}
              onSave={v => onUpdate({ ...section, heading: v })}
              tag="h2"
            />
            <EditableText
              value={section.subheading}
              onSave={v => onUpdate({ ...section, subheading: v })}
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
        {items.map(item => (
          <ContentFlatCard key={item.id} className="info-card">
            {canEdit && <DeleteItemButton onClick={() => onItemDelete(item.id)} />}
            {canEdit ? (
              <>
                <EditableText
                  value={item.heading}
                  onSave={v => onItemUpdate({ ...item, heading: v })}
                  tag="h3"
                />
                <EditableText
                  value={item.subheading}
                  onSave={v => onItemUpdate({ ...item, subheading: v })}
                  tag="p"
                />
              </>
            ) : (
              <>
                <h3>{item.heading}</h3>
                <p>{item.subheading}</p>
              </>
            )}
          </ContentFlatCard>
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
