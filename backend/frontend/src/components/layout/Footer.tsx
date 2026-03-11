import { useAtomValue, useSetAtom } from "jotai";
import { Check, Plus, Trash2 } from "lucide-react";
import { hasPermissionAtom } from "../../atoms/auth";
import { footerConfigAtom } from "../../atoms/config";
import { brandingAtom } from "../../atoms/config";
import { apiRequest } from "../../utils/api";
import { EditableText, VariantCycler } from "../landing/EditControls";
import type { FooterConfig, FooterLink } from "../landing/types";
import { toast } from "sonner";
import "./Footer.css";
import SocialLinks from "./SocialLinks";

const FOOTER_VARIANTS = 2;

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
  variant: 1,
  quick_links: [
    { label: "Home", url: "/" },
    { label: "Store", url: "/store" },
    { label: "Forum", url: "/forum" },
  ],
  contact_heading: "Get in Touch",
  contact_text: "Have questions or want to learn more? Reach out to us.",
  tagline: "Crafted with care",
};

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canEdit = hasPermission("home.manage");
  const footerConfig = useAtomValue(footerConfigAtom);
  const setFooter = useSetAtom(footerConfigAtom);
  const branding = useAtomValue(brandingAtom);

  const cfg: FooterConfig = { ...DEFAULTS, ...footerConfig };
  const variant = cfg.variant || 1;
  const logoUrl = branding?.logo_url || "/logo.png";

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

  // Community items (V1)
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

  // Quick links (V2)
  const links = cfg.quick_links || DEFAULTS.quick_links!;
  const updateLink = (index: number, updates: Partial<FooterLink>) => {
    const next = links.map((l, i) => (i === index ? { ...l, ...updates } : l));
    saveFooter({ quick_links: next });
  };

  const addLink = () => {
    saveFooter({ quick_links: [...links, { label: "Link", url: "/" }] });
  };

  const removeLink = (index: number) => {
    saveFooter({ quick_links: links.filter((_, i) => i !== index) });
  };

  return (
    <footer className={`footer footer-v${variant}`}>
      {canEdit && (
        <div className="footer-variant-cycler-wrapper">
          <VariantCycler
            current={variant}
            total={FOOTER_VARIANTS}
            onCycle={(v) => saveFooter({ variant: v })}
            label="Footer"
          />
        </div>
      )}

      {/* ── Variant 1: Classic community layout ── */}
      {variant === 1 && (
        <>
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
                <button
                  className="footer-add-item-btn"
                  onClick={addCommunityItem}
                >
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
        </>
      )}

      {/* ── Variant 2: Three-column with quick links ── */}
      {variant === 2 && (
        <>
          {/* Background watermark logo */}
          <img
            src={logoUrl}
            alt=""
            className="footer-v2-watermark"
            aria-hidden="true"
          />

          <div className="footer-content footer-v2-grid">
            {/* Brand column */}
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
              <SocialLinks />
            </div>

            {/* Quick Links column */}
            <div className="footer-section">
              <h4>Quick Links</h4>
              <div className="footer-v2-links-grid">
                {links.map((link, i) => (
                  <div key={i} className="footer-v2-link-item">
                    {canEdit ? (
                      <>
                        <EditableText
                          value={link.label}
                          onSave={(v) => updateLink(i, { label: v })}
                          tag="span"
                        />
                        <button
                          className="footer-remove-item-btn"
                          onClick={() => removeLink(i)}
                          title="Remove link"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : (
                      <a href={link.url}>{link.label}</a>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <button className="footer-add-item-btn" onClick={addLink}>
                  <Plus size={14} /> Add link
                </button>
              )}
            </div>

            {/* Contact / CTA column */}
            <div className="footer-section">
              {canEdit ? (
                <>
                  <EditableText
                    value={cfg.contact_heading || DEFAULTS.contact_heading!}
                    onSave={(v) => saveFooter({ contact_heading: v })}
                    tag="h4"
                  />
                  <EditableText
                    value={cfg.contact_text || DEFAULTS.contact_text!}
                    onSave={(v) => saveFooter({ contact_text: v })}
                    tag="p"
                  />
                </>
              ) : (
                <>
                  <h4>{cfg.contact_heading || DEFAULTS.contact_heading}</h4>
                  <p>{cfg.contact_text || DEFAULTS.contact_text}</p>
                </>
              )}
            </div>
          </div>

          <div className="footer-bottom footer-v2-bottom">
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
            <p className="footer-v2-tagline">
              {canEdit ? (
                <EditableText
                  value={cfg.tagline || DEFAULTS.tagline!}
                  onSave={(v) => saveFooter({ tagline: v })}
                  tag="span"
                />
              ) : (
                cfg.tagline || DEFAULTS.tagline
              )}
            </p>
          </div>
        </>
      )}
    </footer>
  );
};
