import { Check, Plus, Trash2, ExternalLink } from "lucide-react";
import type { LandingSection, LandingItem } from "../types";
import "./ProfileCardBlock.css";
import {
  EditableText,
  SectionToolbar,
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

/** Parse section config for checklist items and links. */
function getCfg(config: string): {
  checklist: string[];
  links: { label: string; url: string }[];
  description: string;
} {
  try {
    const c = JSON.parse(config || "{}");
    return {
      checklist: Array.isArray(c.checklist) ? c.checklist : [],
      links: Array.isArray(c.links) ? c.links : [],
      description: c.description || "",
    };
  } catch {
    return { checklist: [], links: [], description: "" };
  }
}

function setCfg(config: string, updates: Record<string, unknown>): string {
  let c: Record<string, unknown> = {};
  try {
    c = JSON.parse(config || "{}");
  } catch {
    /* ignore */
  }
  return JSON.stringify({ ...c, ...updates });
}

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onItemUpdate: (item: LandingItem) => void;
  onItemDelete: (id: number) => void;
}

export const ProfileCardBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const cfg = getCfg(section.config);
  const bannerUrl =
    JSON.parse(section.config || "{}").banner_url || "/banner_7783x7783.png";
  const avatarUrl =
    JSON.parse(section.config || "{}").avatar_url || "/logo.png";

  const updateConfig = (updates: Record<string, unknown>) => {
    onUpdate({ ...section, config: setCfg(section.config, updates) });
  };

  // Checklist CRUD
  const updateCheckItem = (index: number, value: string) => {
    const items = [...cfg.checklist];
    items[index] = value;
    updateConfig({ checklist: items });
  };

  const addCheckItem = () => {
    updateConfig({ checklist: [...cfg.checklist, "New item"] });
  };

  const removeCheckItem = (index: number) => {
    updateConfig({ checklist: cfg.checklist.filter((_, i) => i !== index) });
  };

  // Links CRUD
  const updateLink = (
    index: number,
    updates: Partial<{ label: string; url: string }>,
  ) => {
    const items = cfg.links.map((l, i) =>
      i === index ? { ...l, ...updates } : l,
    );
    updateConfig({ links: items });
  };

  const addLink = () => {
    updateConfig({
      links: [...cfg.links, { label: "Link", url: "https://" }],
    });
  };

  const removeLink = (index: number) => {
    updateConfig({ links: cfg.links.filter((_, i) => i !== index) });
  };

  return (
    <section className="profile-card-section">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Profile Card"
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

      <div className="profile-card-layout">
        {/* Profile card */}
        <div className="profile-card">
          {/* Banner */}
          <div className="profile-card-banner">
            <img src={bannerUrl} alt="Banner" />
            {canEdit && (
              <ImagePickerButton
                onUploaded={(url) => updateConfig({ banner_url: url })}
                className="pb-action-btn-abs"
              />
            )}
            {/* Avatar overlapping bottom of banner */}
            <div className="profile-card-avatar-wrapper">
              <img
                src={avatarUrl}
                alt="Profile"
                className="profile-card-avatar"
              />
              {canEdit && (
                <ImagePickerButton
                  onUploaded={(url) => updateConfig({ avatar_url: url })}
                  className="profile-card-avatar-edit"
                />
              )}
            </div>
          </div>

          {/* Profile info */}
          <div className="profile-card-info">
            {canEdit ? (
              <>
                <EditableText
                  value={
                    JSON.parse(section.config || "{}").profile_name || "Name"
                  }
                  onSave={(v) => updateConfig({ profile_name: v })}
                  tag="h3"
                />
                <EditableText
                  value={
                    JSON.parse(section.config || "{}").profile_subtitle ||
                    "Subtitle"
                  }
                  onSave={(v) => updateConfig({ profile_subtitle: v })}
                  tag="p"
                  className="profile-card-subtitle"
                />
              </>
            ) : (
              <>
                <h3>
                  {JSON.parse(section.config || "{}").profile_name || "Name"}
                </h3>
                <p className="profile-card-subtitle">
                  {JSON.parse(section.config || "{}").profile_subtitle ||
                    "Subtitle"}
                </p>
              </>
            )}

            {/* Links */}
            {(cfg.links.length > 0 || canEdit) && (
              <div className="profile-card-links">
                {cfg.links.map((link, i) => (
                  <div key={i} className="profile-card-link">
                    {canEdit ? (
                      <>
                        <ExternalLink size={14} />
                        <EditableText
                          value={link.label}
                          onSave={(v) => updateLink(i, { label: v })}
                          tag="span"
                        />
                        <button
                          className="footer-remove-item-btn"
                          onClick={() => removeLink(i)}
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} />
                        {link.label}
                      </a>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button className="footer-add-item-btn" onClick={addLink}>
                    <Plus size={14} /> Add link
                  </button>
                )}
              </div>
            )}

            {/* Description */}
            {(cfg.description || canEdit) && (
              <div className="profile-card-description">
                {canEdit ? (
                  <EditableText
                    value={cfg.description}
                    onSave={(v) => updateConfig({ description: v })}
                    tag="p"
                    placeholder="Add a description…"
                  />
                ) : (
                  cfg.description && <p>{cfg.description}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Checklist / highlights side */}
        <div className="profile-card-highlights">
          <ul className="profile-card-checklist">
            {cfg.checklist.map((item, i) => (
              <li key={i} className="profile-card-check-item">
                <Check size={16} className="profile-card-check-icon" />
                {canEdit ? (
                  <>
                    <EditableText
                      value={item}
                      onSave={(v) => updateCheckItem(i, v)}
                      tag="span"
                    />
                    <button
                      className="footer-remove-item-btn"
                      onClick={() => removeCheckItem(i)}
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : (
                  <span>{item}</span>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <button className="footer-add-item-btn" onClick={addCheckItem}>
              <Plus size={14} /> Add item
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
