import { useEffect, useId, useMemo, useState } from "react";
import type { Documentation } from "../../../atoms/documentation";
import type { ForumThread } from "../../../atoms/forum";
import type { Product } from "../../../atoms/store";
import DocumentationViewPage from "../../../pages/documentation/DocumentationViewPage";
import { apiRequest } from "../../../utils/api";
import { ContentFlatCard } from "../../cards/ContentFlatCard";
import ViewThreadPage from "../../forum/thread-view/ViewThreadPage";
import Select from "../../input/Select";
import { ProductPage } from "../../store/ProductPage";
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

function EmbeddedRoute({ resourceType, reference }: { resourceType: ResourceType; reference: string }) {
  return (
    <div className="resource-embed-route" data-resource-type={resourceType}>
      {resourceType === "product" && <ProductPage productId={reference} />}
      {resourceType === "forum_thread" && (
        <ViewThreadPage embeddedThreadId={reference} embedded />
      )}
      {resourceType === "documentation" && (
        <DocumentationViewPage embeddedDocumentationSlug={reference} embedded />
      )}
    </div>
  );
}

export const ResourceEmbedBlock = ({ section, canEdit, onUpdate, preview = false }: Props) => {
  const config = parseConfig(section.config);
  const resourceType = isResourceType(config.resource_type) ? config.resource_type : undefined;
  const reference = config.resource_id ?? "";
  const typeSelectId = useId();
  const selectId = useId();
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit || preview) return;
    const controller = new AbortController();
    const loadOptions = async () => {
      try {
        setPickerError(null);
        setOptions([]);
        if (!resourceType) return;
        if (resourceType === "product") {
          const products = await apiRequest<Product[]>("/store/products?limit=200", {
            signal: controller.signal,
          });
          setOptions(products.map(item => ({ value: String(item.id), label: item.name })));
          return;
        }
        if (resourceType === "forum_thread") {
          const response = await apiRequest<{ threads: ForumThread[] }>(
            "/forum/threads?limit=100",
            { signal: controller.signal }
          );
          setOptions(response.threads.map(item => ({ value: String(item.id), label: item.title })));
          return;
        }
        const [publicDocs, ownedDocs] = await Promise.all([
          apiRequest<Documentation[]>("/docs/", { signal: controller.signal }),
          apiRequest<Documentation[]>("/docs/mine", { signal: controller.signal }).catch(() => []),
        ]);
        const merged = new Map([...publicDocs, ...ownedDocs].map(item => [item.slug, item]));
        setOptions([...merged.values()].map(item => ({ value: item.slug, label: item.title })));
      } catch (cause) {
        if (!controller.signal.aborted) {
          setPickerError(cause instanceof Error ? cause.message : "Unable to load picker options");
        }
      }
    };
    void loadOptions();
    return () => controller.abort();
  }, [canEdit, preview, resourceType]);

  const pickerOptions = useMemo(
    () => [{ value: "", label: `Select ${resourceLabel(resourceType)}` }, ...options],
    [options, resourceType]
  );
  const updateReference = (value: string) => {
    onUpdate({ ...section, config: patchConfig(section.config, { resource_id: value }) });
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
      {!preview && !reference && (
        <ContentFlatCard className="resource-embed-state">
          <strong>No {resourceLabel(resourceType)} selected</strong>
          <span>
            {canEdit
              ? "Choose a resource above to embed it."
              : "This embedded resource has not been configured."}
          </span>
        </ContentFlatCard>
      )}
      {!preview && reference && resourceType && (
        <EmbeddedRoute resourceType={resourceType} reference={reference} />
      )}
    </section>
  );
};
