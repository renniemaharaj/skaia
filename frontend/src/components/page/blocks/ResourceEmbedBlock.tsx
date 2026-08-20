import { BookOpen, ExternalLink, MessageSquare, Package } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Documentation, DocumentationManifest } from "../../../atoms/documentation";
import type { ForumThread } from "../../../atoms/forum";
import type { Product } from "../../../atoms/store";
import { useWebSocketSync } from "../../../hooks/useWebSocketSync";
import { apiRequest } from "../../../utils/api";
import { ContentFlatCard } from "../../cards/ContentFlatCard";
import Select from "../../input/Select";
import { MediaPlaceholder } from "../../ui/MediaPlaceholder";
import { MoneyAmount } from "../../ui/MoneyAmount";
import { RichTextRenderer } from "../../ui/RichTextRenderer";
import { SkeletonPrimitive, SkeletonText } from "../../ui/Skeleton";
import { EditableText } from "../EditControls";
import type { PageItem, PageSection } from "../types";
import "./ResourceEmbedBlock.css";

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (section: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
  onItemDelete: (id: number) => void;
  preview?: boolean;
}

interface EmbedConfig {
  resource_type?: ResourceType;
  resource_id?: string;
}

type EmbedResource = Product | ForumThread | DocumentationManifest;
type ResourceType = "product" | "forum_thread" | "documentation";

const RESOURCE_TYPE_OPTIONS: Array<{ value: ResourceType; label: string }> = [
  { value: "product", label: "Store product" },
  { value: "forum_thread", label: "Forum thread" },
  { value: "documentation", label: "Documentation" },
];

function isResourceType(value: unknown): value is ResourceType {
  return RESOURCE_TYPE_OPTIONS.some(option => option.value === value);
}

function parseConfig(config: unknown): EmbedConfig {
  if (config && typeof config === "object") return config as EmbedConfig;
  if (typeof config !== "string") return {};
  try {
    const parsed = JSON.parse(config || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function patchConfig(config: unknown, updates: Partial<EmbedConfig>): string {
  const next = { ...parseConfig(config), ...updates };
  for (const key of Object.keys(next) as Array<keyof EmbedConfig>) {
    if (!next[key]) delete next[key];
  }
  return JSON.stringify(next);
}

function resourceLabel(resourceType: ResourceType | undefined): string {
  return (
    RESOURCE_TYPE_OPTIONS.find(option => option.value === resourceType)?.label.toLowerCase() ??
    "resource"
  );
}

function ResourceLoading() {
  return (
    <ContentFlatCard className="resource-embed-card resource-embed-loading" role="status">
      <SkeletonPrimitive shape="media" className="resource-embed-loading-media" />
      <div>
        <SkeletonPrimitive width="42%" height={24} />
        <SkeletonText lines={3} />
      </div>
    </ContentFlatCard>
  );
}

function ProductEmbed({ product }: { product: Product }) {
  const cover = product.media?.[0];
  const href = cover?.url || product.image_url;
  const isVideo = cover?.mime_type?.startsWith("video/") || cover?.type === "video";
  return (
    <ContentFlatCard className="resource-embed-card resource-embed-product">
      <div className="resource-embed-media">
        {href ? (
          <MediaPlaceholder
            alt={product.name}
            controls={false}
            fit="cover"
            href={href}
            layout="fill"
            mediaType={isVideo ? "video" : "image"}
            muted
            playsInline
            preserveFrame
            showCaption={false}
            size={{ height: "100%", width: "100%" }}
          />
        ) : (
          <Package aria-hidden="true" size={52} />
        )}
      </div>
      <div className="resource-embed-copy">
        <span className="resource-embed-eyebrow">Store product</span>
        <h3>{product.name}</h3>
        <MoneyAmount cents={product.price} className="resource-embed-price" />
        {product.description && <p>{product.description}</p>}
        <span className="resource-embed-meta">
          {product.stock_unlimited
            ? "In stock"
            : product.stock > 0
              ? `${product.stock} available`
              : "Sold out"}
        </span>
        <Link className="resource-embed-link" to={`/store/product/${product.id}`}>
          Open product <ExternalLink size={14} />
        </Link>
      </div>
    </ContentFlatCard>
  );
}

function ThreadEmbed({ thread }: { thread: ForumThread }) {
  return (
    <ContentFlatCard className="resource-embed-card resource-embed-document">
      <header className="resource-embed-document-header">
        <MessageSquare aria-hidden="true" size={22} />
        <div>
          <span className="resource-embed-eyebrow">Forum thread</span>
          <h3>{thread.title}</h3>
          <span className="resource-embed-meta">
            {thread.user_name || "Community member"} · {thread.reply_count} replies
          </span>
        </div>
      </header>
      <RichTextRenderer
        className="resource-embed-rich-text"
        html={thread.content || ""}
        previewMode
      />
      <Link className="resource-embed-link" to={`/view-thread/${thread.id}`}>
        Open discussion <ExternalLink size={14} />
      </Link>
    </ContentFlatCard>
  );
}

function DocumentationEmbed({
  manifest,
}: {
  manifest: DocumentationManifest;
}) {
  const documentation = manifest.documentation;
  return (
    <ContentFlatCard className="resource-embed-card resource-embed-document">
      <header className="resource-embed-document-header">
        <BookOpen aria-hidden="true" size={22} />
        <div>
          <span className="resource-embed-eyebrow">Documentation</span>
          <h3>{documentation.title}</h3>
        </div>
      </header>
      {documentation.description && <p>{documentation.description}</p>}
      <div className="resource-embed-guide-list">
        {manifest.articles.slice(0, 8).map(guide => (
          <span key={guide.id}>{guide.title}</span>
        ))}
      </div>
      <Link className="resource-embed-link" to={`/doc/${documentation.slug}`}>
        Open documentation <ExternalLink size={14} />
      </Link>
    </ContentFlatCard>
  );
}

export const ResourceEmbedBlock = ({ section, canEdit, onUpdate, preview = false }: Props) => {
  const config = parseConfig(section.config);
  const resourceType = isResourceType(config.resource_type) ? config.resource_type : undefined;
  const reference = config.resource_id ?? "";
  const typeSelectId = useId();
  const selectId = useId();
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [resource, setResource] = useState<EmbedResource | null>(null);
  const [loading, setLoading] = useState(Boolean(reference && !preview));
  const [error, setError] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { subscribe, unsubscribe } = useWebSocketSync();
  const documentationManifest =
    resourceType === "documentation" && resource ? (resource as DocumentationManifest) : null;

  useEffect(() => {
    if (preview) return;
    const numericReference = Number(reference);
    if (!Number.isSafeInteger(numericReference) || numericReference <= 0) return;
    const subscriptionType =
      resourceType === "product"
        ? "store_product"
        : resourceType === "forum_thread"
          ? "thread"
          : null;
    if (!subscriptionType) return;
    subscribe(subscriptionType, numericReference);
    return () => unsubscribe(subscriptionType, numericReference);
  }, [preview, reference, resourceType, subscribe, unsubscribe]);

  useEffect(() => {
    if (preview || !reference) return;
    const eventName =
      resourceType === "product"
        ? "store:updated"
        : resourceType === "forum_thread"
          ? "forum:updated"
          : "documentation:updated";
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener(eventName, refresh);
    window.addEventListener("ws:reconnected", refresh);
    return () => {
      window.removeEventListener(eventName, refresh);
      window.removeEventListener("ws:reconnected", refresh);
    };
  }, [preview, reference, resourceType]);

  useEffect(() => {
    if (preview || !documentationManifest) return;
    subscribe("documentation", documentationManifest.documentation.id);
    return () => {
      unsubscribe("documentation", documentationManifest.documentation.id);
    };
  }, [documentationManifest, preview, subscribe, unsubscribe]);

  useEffect(() => {
    if (!canEdit || preview) return;
    const controller = new AbortController();
    const loadOptions = async () => {
      try {
        setPickerError(null);
        setOptions([]);
        if (!resourceType) {
          setOptions([]);
        } else if (resourceType === "product") {
          const products = await apiRequest<Product[]>("/store/products?limit=200", {
            signal: controller.signal,
          });
          setOptions(products.map(item => ({ value: String(item.id), label: item.name })));
        } else if (resourceType === "forum_thread") {
          const response = await apiRequest<{ threads: ForumThread[] }>(
            "/forum/threads?limit=100",
            {
              signal: controller.signal,
            }
          );
          setOptions(response.threads.map(item => ({ value: String(item.id), label: item.title })));
        } else {
          const [publicDocs, ownedDocs] = await Promise.all([
            apiRequest<Documentation[]>("/docs/", { signal: controller.signal }),
            apiRequest<Documentation[]>("/docs/mine", { signal: controller.signal }).catch(
              () => []
            ),
          ]);
          const merged = new Map([...publicDocs, ...ownedDocs].map(item => [item.slug, item]));
          setOptions([...merged.values()].map(item => ({ value: item.slug, label: item.title })));
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setPickerError(cause instanceof Error ? cause.message : "Unable to load picker options");
      }
    };
    void loadOptions();
    return () => controller.abort();
  }, [canEdit, preview, resourceType]);

  useEffect(() => {
    setResource(null);
    setError(null);
    if (preview || !reference) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const loadResource = async () => {
      try {
        if (resourceType === "product") {
          setResource(
            await apiRequest<Product>(`/store/products/${encodeURIComponent(reference)}`, {
              signal: controller.signal,
            })
          );
        } else if (resourceType === "forum_thread") {
          setResource(
            await apiRequest<ForumThread>(`/forum/threads/${encodeURIComponent(reference)}`, {
              signal: controller.signal,
            })
          );
        } else {
          const manifest = await apiRequest<DocumentationManifest>(
            `/docs/${encodeURIComponent(reference)}`,
            { signal: controller.signal }
          );
          setResource(manifest);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : `Unable to load ${resourceLabel(resourceType)}`
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadResource();
    return () => controller.abort();
  }, [preview, reference, resourceType, retry]);

  const pickerOptions = useMemo(
    () => [{ value: "", label: `Select ${resourceLabel(resourceType)}` }, ...options],
    [options, resourceType]
  );
  const updateReference = (value: string) => {
    onUpdate({
      ...section,
      config: patchConfig(section.config, { resource_id: value }),
    });
  };
  const updateResourceType = (value: string) => {
    onUpdate({
      ...section,
      config: patchConfig(section.config, {
        resource_type: value as ResourceType,
        resource_id: "",
      }),
    });
  };

  return (
    <section className="resource-embed-section">
      {(section.heading || section.subheading || canEdit) && (
        <div className="section-header">
          {canEdit ? (
            <>
              <EditableText
                value={section.heading}
                onSave={heading => onUpdate({ ...section, heading })}
                tag="h2"
                placeholder="Section heading (optional)"
              />
              <EditableText
                value={section.subheading}
                onSave={subheading => onUpdate({ ...section, subheading })}
                tag="p"
                placeholder="Section description (optional)"
              />
            </>
          ) : (
            <>
              {section.heading && <h2>{section.heading}</h2>}
              {section.subheading && <p>{section.subheading}</p>}
            </>
          )}
        </div>
      )}

      {canEdit && (
        <div className="resource-embed-controls">
          <Select
            id={typeSelectId}
            label="Resource type"
            options={[{ value: "", label: "Select type" }, ...RESOURCE_TYPE_OPTIONS]}
            value={resourceType ?? ""}
            onChange={event => updateResourceType(event.target.value)}
            block
          />
          <Select
            id={selectId}
            label="Resource"
            options={pickerOptions}
            value={reference}
            onChange={event => updateReference(event.target.value)}
            disabled={!resourceType}
            block
          />
          {pickerError && (
            <p className="resource-embed-picker-error" role="alert">
              {pickerError}
            </p>
          )}
        </div>
      )}

      {preview && (
        <ContentFlatCard className="resource-embed-state">
          <strong>{section.heading || `Embedded ${resourceLabel(resourceType)}`}</strong>
          <span>Open the page to view this live resource.</span>
        </ContentFlatCard>
      )}
      {!preview && loading && <ResourceLoading />}
      {!preview && !loading && error && (
        <ContentFlatCard className="resource-embed-state" role="alert">
          <strong>Unable to load {resourceLabel(resourceType)}</strong>
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRetry(value => value + 1)}
          >
            Try again
          </button>
        </ContentFlatCard>
      )}
      {!preview && !loading && !error && !reference && (
        <ContentFlatCard className="resource-embed-state">
          <strong>No {resourceLabel(resourceType)} selected</strong>
          <span>
            {canEdit
              ? "Choose a resource above to embed it."
              : "This embedded resource has not been configured."}
          </span>
        </ContentFlatCard>
      )}
      {!preview && !loading && !error && resourceType === "product" && resource && (
        <ProductEmbed product={resource as Product} />
      )}
      {!preview && !loading && !error && resourceType === "forum_thread" && resource && (
        <ThreadEmbed thread={resource as ForumThread} />
      )}
      {!preview && !loading && !error && documentationManifest && (
        <DocumentationEmbed manifest={documentationManifest} />
      )}
    </section>
  );
};
