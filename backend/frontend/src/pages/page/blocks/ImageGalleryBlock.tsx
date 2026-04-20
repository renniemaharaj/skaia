import { useState, useMemo, type ReactNode } from "react";
import "./ImageGalleryBlock.css";
import {
  Plus,
  Trash2,
  LayoutGrid,
  RectangleHorizontal,
  Pencil,
  Maximize2,
  Minimize2,
  AlignCenterHorizontal,
} from "lucide-react";
import type { PageSection, PageItem } from "../types";
import {
  EditableText,
  SectionToolbar,
  DeleteItemButton,
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

interface Album {
  key: string;
  label: string;
}

type CardWidth = "narrow" | "regular" | "wide" | "halfway" | "full";

const CARD_WIDTH_OPTIONS: Array<{
  key: CardWidth;
  title: string;
  icon: ReactNode;
}> = [
  { key: "narrow", title: "Narrow card", icon: <Minimize2 size={14} /> },
  { key: "regular", title: "Regular card", icon: <LayoutGrid size={14} /> },
  { key: "wide", title: "Wide card", icon: <RectangleHorizontal size={14} /> },
  {
    key: "halfway",
    title: "Halfway card",
    icon: <AlignCenterHorizontal size={14} />,
  },
  { key: "full", title: "Full width", icon: <Maximize2 size={14} /> },
];

/** Parse section config for album definitions. */
function getAlbums(config: string): Album[] {
  try {
    const c = JSON.parse(config || "{}");
    if (Array.isArray(c.albums) && c.albums.length > 0) return c.albums;
  } catch {
    /* ignore */
  }
  return [{ key: "all", label: "All" }];
}

/** Parse item config for album key and wide flag. */
function getItemMeta(
  config: string,
  defaultWidth: CardWidth = "regular",
): { album: string; width: CardWidth } {
  try {
    const c = JSON.parse(config || "{}");
    const width = c.width;
    return {
      album: c.album || "all",
      width:
        width === "narrow" ||
        width === "regular" ||
        width === "wide" ||
        width === "halfway" ||
        width === "full"
          ? width
          : c.wide
            ? "wide"
            : defaultWidth,
    };
  } catch {
    return { album: "all", width: defaultWidth };
  }
}

function setItemMeta(
  config: string,
  updates: Partial<{ album: string; width: CardWidth }>,
): string {
  let c: Record<string, unknown> = {};
  try {
    c = JSON.parse(config || "{}");
  } catch {
    /* ignore */
  }
  const updated = { ...c, ...updates };
  if ("width" in updates && "wide" in updated) {
    delete updated.wide;
  }
  return JSON.stringify(updated);
}

function getSectionCardWidth(config: string): CardWidth {
  try {
    const c = JSON.parse(config || "{}");
    if (
      c.default_card_width === "narrow" ||
      c.default_card_width === "regular" ||
      c.default_card_width === "wide" ||
      c.default_card_width === "halfway" ||
      c.default_card_width === "full"
    ) {
      return c.default_card_width;
    }
    if (c.wide) return "wide";
  } catch {
    /* ignore */
  }
  return "regular";
}

function setSectionCardWidth(config: string, width: CardWidth): string {
  let c: Record<string, unknown> = {};
  try {
    c = JSON.parse(config || "{}");
  } catch {
    /* ignore */
  }
  return JSON.stringify({ ...c, default_card_width: width });
}

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
  onItemDelete: (id: number) => void;
}

export const ImageGalleryBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
  onItemCreate,
  onItemUpdate,
  onItemDelete,
}: Props) => {
  const items = section.items ?? [];
  const albums = getAlbums(section.config);
  const [activeAlbum, setActiveAlbum] = useState("all");
  const [editingAlbum, setEditingAlbum] = useState<string | null>(null);
  const [albumDraft, setAlbumDraft] = useState("");
  const defaultCardWidth = getSectionCardWidth(section.config);

  // Filter items by active album and preserve card width metadata.
  const itemsWithMeta = useMemo(
    () =>
      items.map((item) => ({
        item,
        meta: getItemMeta(item.config, defaultCardWidth),
      })),
    [items, defaultCardWidth],
  );

  const filtered = useMemo(() => {
    if (activeAlbum === "all") return itemsWithMeta;
    return itemsWithMeta.filter((it) => it.meta.album === activeAlbum);
  }, [itemsWithMeta, activeAlbum]);

  const wideItems = filtered.filter((it) => it.meta.width === "wide");
  const fullItems = filtered.filter((it) => it.meta.width === "full");
  const cardItems = filtered.filter(
    (it) =>
      it.meta.width === "narrow" ||
      it.meta.width === "regular" ||
      it.meta.width === "halfway",
  );

  // Album management helpers
  const updateAlbums = (next: Album[]) => {
    const c = JSON.parse(section.config || "{}");
    onUpdate({ ...section, config: JSON.stringify({ ...c, albums: next }) });
  };

  const addAlbum = () => {
    const key = `album_${Date.now()}`;
    updateAlbums([...albums, { key, label: "New Album" }]);
    setActiveAlbum(key);
  };

  const renameAlbum = (key: string, label: string) => {
    updateAlbums(albums.map((a) => (a.key === key ? { ...a, label } : a)));
  };

  const removeAlbum = (key: string) => {
    updateAlbums(albums.filter((a) => a.key !== key));
    // Reassign orphaned items to "all"
    items.forEach((it) => {
      const meta = getItemMeta(it.config);
      if (meta.album === key) {
        onItemUpdate({
          ...it,
          config: setItemMeta(it.config, { album: "all" }),
        });
      }
    });
    if (activeAlbum === key) setActiveAlbum("all");
  };

  const addImage = () => {
    onItemCreate(section.id, {
      section_id: section.id,
      display_order: items.length + 1,
      icon: "",
      heading: "",
      subheading: "",
      image_url: "",
      link_url: "",
      config: JSON.stringify({
        album: activeAlbum === "all" ? "all" : activeAlbum,
        width: defaultCardWidth,
      }),
    });
  };

  const setItemWidth = (item: PageItem, width: CardWidth) => {
    onItemUpdate({
      ...item,
      config: setItemMeta(item.config, { width }),
    });
  };

  return (
    <section className="showcase">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Image Gallery"
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
            <div className="gallery-default-width-controls">
              {CARD_WIDTH_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`gallery-default-width-btn icon-btn icon-btn--sm icon-btn--ghost${
                    defaultCardWidth === option.key ? " icon-btn--active" : ""
                  }`}
                  title={`Default ${option.title}`}
                  onClick={() =>
                    onUpdate({
                      ...section,
                      config: setSectionCardWidth(section.config, option.key),
                    })
                  }
                >
                  {option.icon}
                </button>
              ))}
            </div>
          }
        />
      )}

      {/* Heading */}
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

      {/* Album tabs */}
      {(albums.length > 1 || canEdit) && (
        <div className="gallery-album-tabs">
          <button
            className={`gallery-album-tab${activeAlbum === "all" ? " active" : ""}`}
            onClick={() => setActiveAlbum("all")}
          >
            All
          </button>
          {albums
            .filter((a) => a.key !== "all")
            .map((album) => (
              <div key={album.key} className="gallery-album-tab-wrapper">
                {canEdit && editingAlbum === album.key ? (
                  <input
                    className="gallery-album-input"
                    autoFocus
                    value={albumDraft}
                    onChange={(e) => setAlbumDraft(e.target.value)}
                    onBlur={() => {
                      if (albumDraft && albumDraft !== album.label)
                        renameAlbum(album.key, albumDraft);
                      setEditingAlbum(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (albumDraft && albumDraft !== album.label)
                          renameAlbum(album.key, albumDraft);
                        setEditingAlbum(null);
                      }
                      if (e.key === "Escape") setEditingAlbum(null);
                    }}
                  />
                ) : (
                  <button
                    className={`gallery-album-tab${activeAlbum === album.key ? " active" : ""}`}
                    onClick={() => setActiveAlbum(album.key)}
                  >
                    {album.label}
                  </button>
                )}
                {canEdit && (
                  <span className="gallery-album-actions">
                    <button
                      className="gallery-album-action"
                      onClick={() => {
                        setAlbumDraft(album.label);
                        setEditingAlbum(album.key);
                      }}
                      title="Rename album"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      className="gallery-album-action danger"
                      onClick={() => removeAlbum(album.key)}
                      title="Delete album"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          {canEdit && (
            <button className="gallery-album-tab add" onClick={addAlbum}>
              <Plus size={12} /> Album
            </button>
          )}
        </div>
      )}

      {/* Wide images (full-width row) */}
      {wideItems.length > 0 && (
        <div className="gallery-wide-row">
          {wideItems.map(({ item, meta }) => (
            <div key={item.id} className="gallery-wide-item gallery-width-wide">
              {canEdit && (
                <>
                  <ImagePickerButton
                    onUploaded={(url) =>
                      onItemUpdate({ ...item, image_url: url })
                    }
                    className="pb-action-btn-abs"
                  />
                  <div className="gallery-action-group">
                    <div className="gallery-width-controls">
                      {CARD_WIDTH_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={`gallery-width-btn icon-btn icon-btn--sm icon-btn--ghost${
                            meta.width === option.key ? " icon-btn--active" : ""
                          }`}
                          title={option.title}
                          onClick={() => setItemWidth(item, option.key)}
                        >
                          {option.icon}
                        </button>
                      ))}
                    </div>
                    <DeleteItemButton onClick={() => onItemDelete(item.id)} />
                  </div>
                </>
              )}
              <img
                src={item.image_url || "/placeholder.webp"}
                alt={item.heading}
              />
              {item.heading && (
                <div className="gallery-wide-overlay">
                  {canEdit ? (
                    <EditableText
                      value={item.heading}
                      onSave={(v) => onItemUpdate({ ...item, heading: v })}
                      tag="h3"
                    />
                  ) : (
                    <h3>{item.heading}</h3>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {fullItems.length > 0 && (
        <div className="gallery-full-row">
          {fullItems.map(({ item, meta }) => (
            <div key={item.id} className="gallery-wide-item gallery-width-full">
              {canEdit && (
                <>
                  <ImagePickerButton
                    onUploaded={(url) =>
                      onItemUpdate({ ...item, image_url: url })
                    }
                    className="pb-action-btn-abs"
                  />
                  <div className="gallery-action-group">
                    <div className="gallery-width-controls">
                      {CARD_WIDTH_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={`gallery-width-btn icon-btn icon-btn--sm icon-btn--ghost${
                            meta.width === option.key ? " icon-btn--active" : ""
                          }`}
                          title={option.title}
                          onClick={() => setItemWidth(item, option.key)}
                        >
                          {option.icon}
                        </button>
                      ))}
                    </div>
                    <DeleteItemButton onClick={() => onItemDelete(item.id)} />
                  </div>
                </>
              )}
              <img
                src={item.image_url || "/placeholder.webp"}
                alt={item.heading}
              />
              {item.heading && (
                <div className="gallery-wide-overlay">
                  {canEdit ? (
                    <EditableText
                      value={item.heading}
                      onSave={(v) => onItemUpdate({ ...item, heading: v })}
                      tag="h3"
                    />
                  ) : (
                    <h3>{item.heading}</h3>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card images (grid) */}
      <div className="gallery-card-grid">
        {cardItems.map(({ item, meta }) => (
          <div
            key={item.id}
            className={`gallery-card-item gallery-card-item--${meta.width}`}
          >
            {canEdit && (
              <>
                <ImagePickerButton
                  onUploaded={(url) =>
                    onItemUpdate({ ...item, image_url: url })
                  }
                  className="pb-action-btn-abs"
                />
                <div className="gallery-action-group">
                  <div className="gallery-width-controls">
                    {CARD_WIDTH_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`gallery-width-btn icon-btn icon-btn--sm icon-btn--ghost${
                          meta.width === option.key ? " icon-btn--active" : ""
                        }`}
                        title={option.title}
                        onClick={() => setItemWidth(item, option.key)}
                      >
                        {option.icon}
                      </button>
                    ))}
                  </div>
                  <DeleteItemButton onClick={() => onItemDelete(item.id)} />
                </div>
              </>
            )}
            <img
              src={item.image_url || "/placeholder.webp"}
              alt={item.heading}
            />
            {(item.heading || canEdit) && (
              <div className="showcase-overlay">
                {canEdit ? (
                  <EditableText
                    value={item.heading}
                    onSave={(v) => onItemUpdate({ ...item, heading: v })}
                    tag="h3"
                  />
                ) : (
                  item.heading && <h3>{item.heading}</h3>
                )}
              </div>
            )}
          </div>
        ))}
        {canEdit && (
          <button className="gallery-add-image-btn" onClick={addImage}>
            <Plus size={20} />
            <span>Add image</span>
          </button>
        )}
      </div>
    </section>
  );
};
