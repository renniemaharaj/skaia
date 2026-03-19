import type { LandingSection } from "../types";
import { SectionToolbar, IconPicker } from "../EditControls";
import { ICON_MAP } from "../iconMap";
import { Pencil, Plus, Trash2, Check } from "lucide-react";
import { useState } from "react";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

interface SocialLink {
  icon: string;
  url: string;
}

/** Inline editor for a single social link in the landing block. */
const BlockSocialLinkEditor = ({
  link,
  index,
  onUpdate,
  onRemove,
}: {
  link: SocialLink;
  index: number;
  onUpdate: (index: number, updates: Partial<SocialLink>) => void;
  onRemove: (index: number) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(link.url);
  const Icon = ICON_MAP[link.icon];

  if (editing) {
    return (
      <div className="social-link-editor">
        <IconPicker
          current={link.icon}
          onPick={(name) => onUpdate(index, { icon: name })}
        />
        <input
          className="social-link-url-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              if (url !== link.url) onUpdate(index, { url });
            }
            if (e.key === "Escape") {
              setUrl(link.url);
              setEditing(false);
            }
          }}
        />
        <button
          className="social-link-action-btn"
          onClick={() => {
            setEditing(false);
            if (url !== link.url) onUpdate(index, { url });
          }}
          title="Done"
        >
          <Check size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="social-link-editable">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="social-link"
        title={link.url}
      >
        {Icon ? <Icon size={20} /> : link.icon}
      </a>
      <div className="social-link-actions">
        <button
          className="social-link-action-btn"
          onClick={() => {
            setUrl(link.url);
            setEditing(true);
          }}
          title="Edit"
        >
          <Pencil size={10} />
        </button>
        <button
          className="social-link-action-btn danger"
          onClick={() => onRemove(index)}
          title="Remove"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
};

export const SocialLinksBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const cfg = JSON.parse(section.config || "{}");
  const links: SocialLink[] = cfg.links ?? [];

  const saveLinks = (nextLinks: SocialLink[]) => {
    const nextConfig = JSON.stringify({ ...cfg, links: nextLinks });
    onUpdate({ ...section, config: nextConfig });
  };

  const updateLink = (index: number, updates: Partial<SocialLink>) => {
    const next = links.map((l, i) => (i === index ? { ...l, ...updates } : l));
    saveLinks(next);
  };

  const addLink = () => {
    saveLinks([...links, { icon: "Globe", url: "https://" }]);
  };

  const removeLink = (index: number) => {
    saveLinks(links.filter((_, i) => i !== index));
  };

  return (
    <div style={{ position: "relative" }}>
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Social Links"
        />
      )}
      <div className="social-links">
        {links.map((social, i) =>
          canEdit ? (
            <BlockSocialLinkEditor
              key={i}
              link={social}
              index={i}
              onUpdate={updateLink}
              onRemove={removeLink}
            />
          ) : (
            <a
              key={i}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              title={social.url}
            >
              {(() => {
                const Ic = ICON_MAP[social.icon];
                return Ic ? <Ic size={20} /> : social.icon;
              })()}
            </a>
          ),
        )}
        {canEdit && (
          <button
            className="social-link-add-btn"
            onClick={addLink}
            title="Add social link"
          >
            <Plus size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
