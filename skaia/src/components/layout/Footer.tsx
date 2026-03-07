import { useAtomValue, useSetAtom } from "jotai";
import { Check, Plus, Trash2 } from "lucide-react";
import { hasPermissionAtom } from "../../atoms/auth";
import { footerConfigAtom } from "../../atoms/config";
import { apiRequest } from "../../utils/api";
import { EditableText } from "../landing/EditControls";
import type { FooterConfig } from "../landing/types";
import { toast } from "sonner";
import "./Footer.css";
import SocialLinks from "./SocialLinks";

const DEFAULTS: FooterConfig = {
  site_title: "Cueballcraft Skaiacraft",
  site_description:
    "A premium vanilla Minecraft server with a community spanning over 12 years",
  community_heading: "Community",
  community_items: [
    "Family Friendly Environment",
    "Support for All Clients",
    "Active Moderation",
    "Welcoming to New Players",
  ],
  copyright_text: "Cueballcraft Skaiacraft. All rights reserved.",
};

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canEdit = hasPermission("home.manage");
  const footerConfig = useAtomValue(footerConfigAtom);
  const setFooter = useSetAtom(footerConfigAtom);

  const cfg: FooterConfig = { ...DEFAULTS, ...footerConfig };

  const saveFooter = async (updates: Partial<FooterConfig>) => {
    const updated = { ...cfg, ...updates };
    try {
      await apiRequest("/config/footer", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      setFooter(updated);
      toast.success("Footer saved");
    } catch {
      toast.error("Failed to save footer");
    }
  };

  const updateCommunityItem = (index: number, value: string) => {
    const items = [...cfg.community_items];
    items[index] = value;
    saveFooter({ community_items: items });
  };

  const addCommunityItem = () => {
    saveFooter({ community_items: [...cfg.community_items, "New item"] });
  };

  const removeCommunityItem = (index: number) => {
    const items = cfg.community_items.filter((_, i) => i !== index);
    saveFooter({ community_items: items });
  };

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          {canEdit ? (
            <>
              <EditableText
                value={cfg.site_title}
                onSave={(v) => saveFooter({ site_title: v })}
                tag="h3"
              />
              <EditableText
                value={cfg.site_description}
                onSave={(v) => saveFooter({ site_description: v })}
                tag="p"
              />
            </>
          ) : (
            <>
              <h3>{cfg.site_title}</h3>
              <p>{cfg.site_description}</p>
            </>
          )}
        </div>

        <div className="footer-section">
          {canEdit ? (
            <EditableText
              value={cfg.community_heading}
              onSave={(v) => saveFooter({ community_heading: v })}
              tag="h4"
            />
          ) : (
            <h4>{cfg.community_heading}</h4>
          )}
          <ul>
            {cfg.community_items.map((item, i) => (
              <li key={i} className="footer-community-item">
                <Check size={14} className="footer-check-icon" />
                {canEdit ? (
                  <>
                    <EditableText
                      value={item}
                      onSave={(v) => updateCommunityItem(i, v)}
                      tag="span"
                    />
                    <button
                      className="footer-remove-item-btn"
                      onClick={() => removeCommunityItem(i)}
                      title="Remove item"
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
            <button className="footer-add-item-btn" onClick={addCommunityItem}>
              <Plus size={14} /> Add item
            </button>
          )}
        </div>

        <div className="footer-section">
          <h4>Connect</h4>
          <SocialLinks />
        </div>
      </div>

      <div className="footer-bottom">
        <p>
          &copy; {currentYear}{" "}
          {canEdit ? (
            <EditableText
              value={cfg.copyright_text}
              onSave={(v) => saveFooter({ copyright_text: v })}
              tag="span"
            />
          ) : (
            cfg.copyright_text
          )}
        </p>
      </div>
    </footer>
  );
};
