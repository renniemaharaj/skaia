import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  Columns3,
  RectangleHorizontal,
  Pencil,
} from "lucide-react";
import type { LandingSection, LandingItem } from "../types";
import {
  EditableText,
  SectionToolbar,
  DeleteItemButton,
  ImagePickerButton,
  getSectionLayout,
  setSectionLayout,
} from "../EditControls";

interface Album {
  key: string;
  label: string;
}

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
function getItemMeta(config: string): { album: string; wide: boolean } {
  try {
    const c = JSON.parse(config || "{}");
    return { album: c.album || "all", wide: !!c.wide };
  } catch {
    return { album: "all", wide: false };
  }
}

function setItemMeta(
  config: string,
  updates: Partial<{ album: string; wide: boolean }>,
): string {
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

  // Filter items by active album
  const filtered = useMemo(() => {
    if (activeAlbum === "all") return items;
    return items.filter((it) => getItemMeta(it.config).album === activeAlbum);
  }, [items, activeAlbum]);

  const wideItems = filtered.filter((it) => getItemMeta(it.config).wide);
  const cardItems = filtered.filter((it) => !getItemMeta(it.config).wide);

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
        wide: false,
      }),
    });
  };

  const toggleWide = (item: LandingItem) => {
    const meta = getItemMeta(item.config);
    onItemUpdate({
      ...item,
      config: setItemMeta(item.config, { wide: !meta.wide }),
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
          {wideItems.map((item) => (
            <div key={item.id} className="gallery-wide-item">
              {canEdit && (
                <>
                  <ImagePickerButton
                    onUploaded={(url) =>
                      onItemUpdate({ ...item, image_url: url })
                    }
                    className="landing-action-btn-abs"
                  />
                  <button
                    className="landing-action-btn gallery-toggle-wide"
                    onClick={() => toggleWide(item)}
                    title="Switch to card layout"
                  >
                    <Columns3 size={14} />
                  </button>
                  <DeleteItemButton onClick={() => onItemDelete(item.id)} />
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
        {cardItems.map((item) => (
          <div key={item.id} className="gallery-card-item">
            {canEdit && (
              <>
                <ImagePickerButton
                  onUploaded={(url) =>
                    onItemUpdate({ ...item, image_url: url })
                  }
                  className="landing-action-btn-abs"
                />
                <button
                  className="landing-action-btn gallery-toggle-wide"
                  onClick={() => toggleWide(item)}
                  title="Switch to wide layout"
                >
                  <RectangleHorizontal size={14} />
                </button>
                <DeleteItemButton onClick={() => onItemDelete(item.id)} />
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
