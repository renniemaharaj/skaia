import type { PageSection } from "../types";
import "./CTABlock.css";
import {
  EditableText,
  SectionToolbar,
  ColorPickerButton,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  getSectionAnimationIntensity,
  setSectionAnimation,
  setSectionAnimationIntensity,
  getSectionBgColor,
  setSectionBgColor,
} from "../EditControls";

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
}

export const CTABlock = ({ section, canEdit, onUpdate, onDelete }: Props) => {
  const sectionBgColor = getSectionBgColor(section.config);
  const ctaStyle = sectionBgColor ? { background: sectionBgColor } : undefined;

  return (
    <section className="cta" style={ctaStyle}>
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
          animationIntensity={getSectionAnimationIntensity(section.config)}
          onAnimationIntensityChange={(i) =>
            onUpdate({
              ...section,
              config: setSectionAnimationIntensity(section.config, i),
            })
          }
          extra={
            <ColorPickerButton
              value={sectionBgColor}
              onChange={(c: string) =>
                onUpdate({
                  ...section,
                  config: setSectionBgColor(section.config, c),
                })
              }
              title="Primary color"
            />
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
