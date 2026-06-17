import { Pencil, Plus, Trash2, Check } from "lucide-react";
import { useState } from "react";
import type { FooterSocialLink } from "../types";
import { ICON_MAP } from "../iconMap";
import { IconPicker } from "../EditControls";

interface Props {
  links: FooterSocialLink[];
  canEdit: boolean;
  onUpdate?: (index: number, updates: Partial<FooterSocialLink>) => void;
  onAdd?: () => void;
  onRemove?: (index: number) => void;
}

/** Inline editor for a single social-link (icon + url). */
const SocialLinkEditor = ({
  link,
  index,
  onUpdate,
  onRemove,
}: {
  link: FooterSocialLink;
  index: number;
  onUpdate: (index: number, updates: Partial<FooterSocialLink>) => void;
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

const SocialLinks = ({ links, canEdit, onUpdate, onAdd, onRemove }: Props) => {
  return (
    <div className="social-links">
      {links.map((social, index) =>
        canEdit && onUpdate && onRemove ? (
          <SocialLinkEditor
            key={index}
            link={social}
            index={index}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ) : (
          <a
            key={index}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            className="social-link"
            title={social.url}
          >
            {(() => {
              const Icon = ICON_MAP[social.icon];
              return Icon ? <Icon size={20} /> : social.icon;
            })()}
          </a>
        ),
      )}
      {canEdit && onAdd && (
        <button
          className="social-link-add-btn"
          onClick={onAdd}
          title="Add social link"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
};

export default SocialLinks;
