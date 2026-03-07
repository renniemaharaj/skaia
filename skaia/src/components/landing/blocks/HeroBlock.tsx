import type { LandingSection } from "../types";
import {
  EditableText,
  SectionToolbar,
  ImagePickerButton,
} from "../EditControls";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

export const HeroBlock = ({ section, canEdit, onUpdate, onDelete }: Props) => {
  const cfg = JSON.parse(section.config || "{}");
  const bgImage = cfg.background_image || "/banner_7783x7783.png";

  const updateBgImage = (url: string) => {
    const newCfg = { ...cfg, background_image: url };
    onUpdate({ ...section, config: JSON.stringify(newCfg) });
  };

  return (
    <section className="hero-banner">
      <img src={bgImage} alt={section.heading} className="banner-image" />
      <div className="banner-overlay">
        <div className="banner-content">
          {canEdit ? (
            <>
              <SectionToolbar
                onDelete={() => onDelete(section.id)}
                label="Hero"
                extra={<ImagePickerButton onUploaded={updateBgImage} />}
              />
              <EditableText
                value={section.heading}
                onSave={(v) => onUpdate({ ...section, heading: v })}
                tag="h1"
              />
              <EditableText
                value={section.subheading}
                onSave={(v) => onUpdate({ ...section, subheading: v })}
                tag="p"
              />
            </>
          ) : (
            <>
              <h1>{section.heading}</h1>
              <p>{section.subheading}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
