/**
 * ComponentRenderer — renders a single registered component using bound row data.
 *
 * Given a ComponentDefinition, a bindings map, and a raw data row, it resolves
 * each bind-point value and renders the correct visual for the component type.
 */
import type { ComponentDefinition } from "./types";
import { MediaViewer, type MediaScrapeJob } from "../../components/mediascraper/MediaViewer";
import { apiRequest } from "../../utils/api";
import { useState, useEffect } from "react";
import "./ComponentRenderer.css";

/*  helpers  */

type Resolved = Record<string, unknown>;
type StyleMap = Record<string, React.CSSProperties | undefined>;

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string")
    return v.toLowerCase() === "true" || v === "1" || v === "yes";
  return !!v;
}

function resolveBindings(
  component: ComponentDefinition,
  bindings: Record<string, string>,
  row: Record<string, unknown>,
): Resolved {
  const resolved: Resolved = {};
  for (const bp of component.bind_points) {
    const column = bindings[bp.key];
    if (column && row[column] !== undefined) {
      resolved[bp.key] = row[column];
    } else if (bp.fallback !== undefined) {
      resolved[bp.key] = bp.fallback;
    }
  }
  return resolved;
}

function resolveStyles(
  component: ComponentDefinition,
  overrides?: Record<string, Record<string, string>>,
): StyleMap {
  const m: StyleMap = {};
  for (const t of component.style_targets) {
    m[t] = overrides?.[t] as React.CSSProperties | undefined;
  }
  return m;
}

/*  primitive renderers  */

function PrimitiveDiv({ styles }: { styles: StyleMap }) {
  return <div className="cr-div" style={styles.root} />;
}

function PrimitiveText({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  return (
    <p className="cr-text" style={styles.root}>
      {str(data.body)}
    </p>
  );
}

function PrimitiveButton({
  data,
  styles,
  onEvent,
}: {
  data: Resolved;
  styles: StyleMap;
  onEvent?: (e: string, d: unknown) => void;
}) {
  return (
    <button
      className="cr-button"
      style={styles.root}
      disabled={bool(data.disabled)}
      onClick={(e) => {
        e.preventDefault();
        onEvent?.("onClick", data);
        if (data.href) window.open(str(data.href), "_blank");
      }}
    >
      {str(data.title)}
    </button>
  );
}

function PrimitiveCheckbox({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  return (
    <label className="cr-checkbox" style={styles.root}>
      <input
        type="checkbox"
        checked={bool(data.checked)}
        disabled={bool(data.disabled)}
        readOnly
      />
      {!!data.title && (
        <span className="cr-checkbox__label" style={styles.label}>
          {str(data.title)}
        </span>
      )}
    </label>
  );
}

function PrimitiveImage({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  const src = str(data.media);
  const alt = str(data.alt) || "image";
  const img = src ? (
    <img className="cr-image__img" src={src} alt={alt} style={styles.image} />
  ) : (
    <div className="cr-image__placeholder">No image</div>
  );
  return (
    <div className="cr-image" style={styles.root}>
      {data.href ? (
        <a href={str(data.href)} target="_blank" rel="noopener noreferrer">
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  );
}

function PrimitiveLink({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  return (
    <a
      className="cr-link"
      href={str(data.href)}
      target="_blank"
      rel="noopener noreferrer"
      style={styles.root}
    >
      {str(data.title)}
    </a>
  );
}

function PrimitiveIcon({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  const icon = str(data.icon);
  const isUrl = /^https?:\/\//i.test(icon);
  return (
    <span
      className="cr-icon"
      style={styles.root}
      aria-label={str(data.aria_label)}
    >
      {isUrl ? (
        <img className="cr-icon__img" src={icon} alt="" />
      ) : (
        <span className="cr-icon__glyph">{icon}</span>
      )}
    </span>
  );
}

/*  compound renderers  */

function CompoundCard({
  data,
  styles,
  onEvent,
}: {
  data: Resolved;
  styles: StyleMap;
  onEvent?: (e: string, d: unknown) => void;
}) {
  return (
    <div
      className="cr-card"
      style={styles.root}
      onClick={() => onEvent?.("onClick", data)}
    >
      {!!data.media && (
        <div className="cr-card__image" style={styles.image}>
          <img src={str(data.media)} alt={str(data.title)} />
        </div>
      )}
      <div className="cr-card__body" style={styles.body}>
        {!!data.icon && <span className="cr-card__icon">{str(data.icon)}</span>}
        {!!data.title && (
          <h3 className="cr-card__title" style={styles.header}>
            {str(data.title)}
          </h3>
        )}
        {!!data.body && <p className="cr-card__text">{str(data.body)}</p>}
      </div>
      {!!data.href && (
        <div className="cr-card__footer" style={styles.footer}>
          <a href={str(data.href)} target="_blank" rel="noopener noreferrer">
            View =>
          </a>
        </div>
      )}
    </div>
  );
}

function CompoundStat({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  return (
    <div className="cr-stat" style={styles.root}>
      {!!data.icon && (
        <span className="cr-stat__icon" style={styles.icon}>
          {str(data.icon)}
        </span>
      )}
      <span className="cr-stat__value" style={styles.value}>
        {str(data.title)}
      </span>
      {!!data.body && (
        <span className="cr-stat__label" style={styles.label}>
          {str(data.body)}
        </span>
      )}
    </div>
  );
}

function CompoundMediaCard({
  data,
  styles,
  onEvent,
}: {
  data: Resolved;
  styles: StyleMap;
  onEvent?: (e: string, d: unknown) => void;
}) {
  const src = str(data.media);
  return (
    <div
      className="cr-media-card"
      style={styles.root}
      onClick={() => onEvent?.("onClick", data)}
    >
      <div className="cr-media-card__media" style={styles.media}>
        {src ? (
          <img src={src} alt={str(data.title)} />
        ) : (
          <div className="cr-media-card__placeholder">No media</div>
        )}
      </div>
      {!!data.title && (
        <div className="cr-media-card__caption" style={styles.caption}>
          {data.href ? (
            <a
              href={str(data.href)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {str(data.title)}
            </a>
          ) : (
            str(data.title)
          )}
        </div>
      )}
    </div>
  );
}

function CompoundMediaScraper({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  const url = str(data.url);
  const [job, setJob] = useState<MediaScrapeJob>({ url, status: "pending" });

  useEffect(() => {
    if (!url) return;
    let active = true;

    const handleResult = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string; result?: { images: string[], last_scanned: string }; error?: string }>;
      const data = customEvent.detail;
      if (active && data.url === url) {
        if (data.error) {
          setJob({ url, status: "error", error: data.error });
        } else if (data.result && data.result.images) {
          setJob({ 
            url, 
            status: "done", 
            images: data.result.images, 
            lastScanned: data.result.last_scanned 
          });
        }
      }
    };
    const handleStarted = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string }>;
      const data = customEvent.detail;
      if (active && data.url === url && job?.status === "pending") {
        setJob({ url, status: "scraping" });
      }
    };

    const doScrape = () => {
      if (!active) return;
      setJob({ url, status: "pending" });
      apiRequest<{images?: string[], last_scanned?: string, status?: string}>(`/mediascraper/scrape?url=${encodeURIComponent(url)}`, { method: "GET" })
        .then((res) => {
          if (active && res && res.images) {
            setJob({ 
              url, 
              status: "done", 
              images: res.images || [], 
              lastScanned: res.last_scanned 
            });
          }
        })
        .catch((err) => {
          if (active) {
             setJob({ url, status: "error", error: err.message });
          }
        });
    };

    const handlePending = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string }>;
      const data = customEvent.detail;
      if (active && data.url === url) {
        doScrape();
      }
    };

    window.addEventListener("mediascraper:result", handleResult);
    window.addEventListener("mediascraper:started", handleStarted);
    window.addEventListener("mediascraper:pending", handlePending);
    
    const timer = setTimeout(doScrape, 500);

    return () => { 
      active = false; 
      clearTimeout(timer);
      window.removeEventListener("mediascraper:result", handleResult);
      window.removeEventListener("mediascraper:started", handleStarted);
      window.removeEventListener("mediascraper:pending", handlePending);
    };
  }, [url]);

  return (
    <div style={styles.root} className="cr-compound-media-scraper">
      <MediaViewer job={job} />
    </div>
  );
}

function CompoundProfile({
  data,
  styles,
}: {
  data: Resolved;
  styles: StyleMap;
}) {
  return (
    <div className="cr-profile" style={styles.root}>
      {!!data.media && (
        <div className="cr-profile__avatar" style={styles.avatar}>
          <img src={str(data.media)} alt={str(data.title)} />
        </div>
      )}
      <div className="cr-profile__info">
        <span className="cr-profile__name" style={styles.name}>
          {str(data.title)}
        </span>
        {!!data.body && (
          <p className="cr-profile__bio" style={styles.bio}>
            {str(data.body)}
          </p>
        )}
      </div>
      {!!data.href && (
        <a
          className="cr-profile__link"
          href={str(data.href)}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Profile
        </a>
      )}
    </div>
  );
}

/*  public API  */

export interface ComponentRendererProps {
  component: ComponentDefinition;
  bindings: Record<string, string>;
  row: Record<string, unknown>;
  styleOverrides?: Record<string, Record<string, string>>;
  onEvent?: (event: string, data: unknown) => void;
}

export function ComponentRenderer({
  component,
  bindings,
  row,
  styleOverrides,
  onEvent,
}: ComponentRendererProps) {
  const data = resolveBindings(component, bindings, row);
  const styles = resolveStyles(component, styleOverrides);

  switch (component.type) {
    case "primitive.div":
      return <PrimitiveDiv styles={styles} />;
    case "primitive.text":
      return <PrimitiveText data={data} styles={styles} />;
    case "primitive.button":
      return (
        <PrimitiveButton data={data} styles={styles} onEvent={onEvent} />
      );
    case "primitive.checkbox":
      return <PrimitiveCheckbox data={data} styles={styles} />;
    case "primitive.image":
      return <PrimitiveImage data={data} styles={styles} />;
    case "primitive.link":
      return <PrimitiveLink data={data} styles={styles} />;
    case "primitive.icon":
      return <PrimitiveIcon data={data} styles={styles} />;
    case "compound.card":
      return (
        <CompoundCard data={data} styles={styles} onEvent={onEvent} />
      );
    case "compound.stat":
      return <CompoundStat data={data} styles={styles} />;
    case "compound.media_card":
      return (
        <CompoundMediaCard data={data} styles={styles} onEvent={onEvent} />
      );
    case "compound.profile":
      return <CompoundProfile data={data} styles={styles} />;
    case "compound.mediascraper":
      return <CompoundMediaScraper data={data} styles={styles} />;
    default:
      return (
        <div className="cr-unknown">
          Unknown component: <code>{component.type}</code>
        </div>
      );
  }
}

/** Grid that renders one component per row of data. */
export function ComponentGrid({
  component,
  bindings,
  rows,
  styleOverrides,
  onEvent,
}: {
  component: ComponentDefinition;
  bindings: Record<string, string>;
  rows: Record<string, unknown>[];
  styleOverrides?: Record<string, Record<string, string>>;
  onEvent?: (event: string, data: unknown) => void;
}) {
  return (
    <div className="cr-grid">
      {rows.map((row, i) => (
        <div key={i} className="cr-grid__item">
          <ComponentRenderer
            component={component}
            bindings={bindings}
            row={row}
            styleOverrides={styleOverrides}
            onEvent={onEvent}
          />
        </div>
      ))}
    </div>
  );
}
