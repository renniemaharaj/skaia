import type { PageSection } from "../types";
import "./CTABlock.css";
import { EditableText, getSectionBgColor } from "../EditControls";

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
}

export const CTABlock = ({ section, canEdit, onUpdate }: Props) => {
  const sectionBgColor = getSectionBgColor(section.config);
  const ctaStyle = sectionBgColor ? { background: sectionBgColor } : undefined;

  return (
    <section className="cta" style={ctaStyle}>
      <div className="cta-content">
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
            <h2>{section.heading}</h2>
            <p>{section.subheading}</p>
          </>
        )}
      </div>
    </section>
  );
};
