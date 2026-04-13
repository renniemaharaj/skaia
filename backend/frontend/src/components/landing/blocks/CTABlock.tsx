import type { LandingSection } from "../types";
import {
  EditableText,
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  setSectionAnimation,
  getSectionBgColor,
  setSectionBgColor,
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
          bgColor={getSectionBgColor(section.config)}
          onBgColorChange={(c) =>
            onUpdate({
              ...section,
              config: setSectionBgColor(section.config, c),
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
