import type { LandingSection } from "../types";
import { ICON_MAP } from "../iconMap";
import { SectionToolbar } from "../EditControls";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

interface SocialLink {
  name: string;
  icon: string;
  url: string;
}

export const SocialLinksBlock = ({
  section,
  canEdit,
  //   onUpdate,
  onDelete,
}: Props) => {
  const cfg = JSON.parse(section.config || "{}");
  const links: SocialLink[] = cfg.links ?? [];

  return (
    <div style={{ position: "relative" }}>
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Social Links"
        />
      )}
      <div className="social-links">
        {links.map((social, i) => {
          const Icon = ICON_MAP[social.icon];
          return (
            <a
              key={i}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              title={social.name}
            >
              {Icon ? <Icon size={20} /> : social.name}
            </a>
          );
        })}
      </div>
      {canEdit && links.length === 0 && (
        <p style={{ textAlign: "center", opacity: 0.5, padding: "1rem" }}>
          No social links configured. Edit the section config JSON to add links.
        </p>
      )}
    </div>
  );
};
