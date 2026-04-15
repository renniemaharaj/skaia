import { useAtomValue, useSetAtom } from "jotai";
import { Check, Plus, Trash2 } from "lucide-react";
import { useGuestSandboxMode } from "../../../hooks/useGuestSandboxMode";
import { hasPermissionAtom } from "../../../atoms/auth";
import { footerConfigAtom } from "../../../atoms/config";
import { brandingAtom } from "../../../atoms/config";
import { apiRequest } from "../../../utils/api";
import { EditableText, VariantCycler } from "../EditControls";
import type { FooterConfig, FooterLink, FooterSocialLink } from "../types";
import { toast } from "sonner";
import "./Footer.css";
import SocialLinks from "./SocialLinks";

const FOOTER_VARIANTS = 2;

const DEFAULTS: FooterConfig = {
  site_title: "",
  site_description: "",
  community_heading: "",
  community_items: [],
  copyright_text: "",
  variant: 1,
  quick_links: [
    { label: "Home", url: "/" },
    { label: "Store", url: "/store" },
    { label: "Forum", url: "/forum" },
  ],
  contact_heading: "",
  contact_text: "",
  tagline: "",
  social_links: [],
};

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const hasPermission = useAtomValue(hasPermissionAtom);
  const [guestSandboxMode] = useGuestSandboxMode();
  const canEdit = hasPermission("home.manage") || guestSandboxMode;
  const footerConfig = useAtomValue(footerConfigAtom);
  const setFooter = useSetAtom(footerConfigAtom);
  const branding = useAtomValue(brandingAtom);

  const loading = !footerConfig && !branding;
  const merged: FooterConfig = { ...DEFAULTS, ...footerConfig };
  // Guard against null arrays from API (JSON null overrides defaults)
  const cfg: FooterConfig = {
    ...merged,
    community_items: merged.community_items ?? [],
    quick_links: merged.quick_links ?? DEFAULTS.quick_links!,
    social_links: merged.social_links ?? [],
  };
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
  const links = cfg.quick_links;
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

  // Social links
  const socialLinks = cfg.social_links;
  const updateSocialLink = (
    index: number,
    updates: Partial<FooterSocialLink>,
  ) => {
    const next = socialLinks.map((l, i) =>
      i === index ? { ...l, ...updates } : l,
    );
    saveFooter({ social_links: next });
  };

  const addSocialLink = () => {
    saveFooter({
      social_links: [...socialLinks, { icon: "Globe", url: "https://" }],
    });
  };

  const removeSocialLink = (index: number) => {
    saveFooter({ social_links: socialLinks.filter((_, i) => i !== index) });
  };

  if (loading) {
    return (
      <footer className="footer footer-v1">
        <div
          className="footer-content"
          style={{
            display: "flex",
            gap: "2rem",
            padding: "2rem",
            justifyContent: "center",
          }}
        >
          <div style={{ flex: 1, maxWidth: 300 }}>
            <div
              className="skeleton"
              style={{ width: "60%", height: 18, marginBottom: 12 }}
            />
            <div
              className="skeleton"
              style={{ width: "90%", height: 12, marginBottom: 8 }}
            />
            <div className="skeleton" style={{ width: "70%", height: 12 }} />
          </div>
          <div style={{ flex: 1, maxWidth: 300 }}>
            <div
              className="skeleton"
              style={{ width: "50%", height: 18, marginBottom: 12 }}
            />
            <div
              className="skeleton"
              style={{ width: "80%", height: 12, marginBottom: 8 }}
            />
            <div className="skeleton" style={{ width: "60%", height: 12 }} />
          </div>
        </div>
      </footer>
    );
  }

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
              <SocialLinks
                links={socialLinks}
                canEdit={canEdit}
                onUpdate={updateSocialLink}
                onAdd={addSocialLink}
                onRemove={removeSocialLink}
              />
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
              <SocialLinks
                links={socialLinks}
                canEdit={canEdit}
                onUpdate={updateSocialLink}
                onAdd={addSocialLink}
                onRemove={removeSocialLink}
              />
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
