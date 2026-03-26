import type { LandingSection } from "../types";
import {
  EditableText,
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
} from "../EditControls";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

export const CTABlock = ({ section, canEdit, onUpdate, onDelete }: Props) => {
  return (
    <section className="cta">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="CTA"
          layout={getSectionLayout(section.config)}
          onLayoutChange={(nextLayout) =>
            onUpdate({
              ...section,
              config: setSectionLayout(section.config, nextLayout),
            })
          }
        />
      )}
      <div className="cta-content">
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
            <h2>{section.heading}</h2>
            <p>{section.subheading}</p>
          </>
        )}
      </div>
    </section>
  );
};
