import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../utils/api";
import { AsyncBoundary } from "../ui/AsyncBoundary";
import { useIntentActivation, useViewportActivation } from "../ui/DeferredRender";
import { SkeletonContent, SkeletonPrimitive, SkeletonText } from "../ui/Skeleton";
import { SectionSkeleton } from "./SectionSkeleton";
import type { PageSection } from "./types";

const BlockRenderer = lazy(() =>
  import("./BlockRenderer").then(module => ({ default: module.BlockRenderer }))
);

interface PagePreviewResponse {
  id: number;
  content: string;
  updated_at: string;
}

interface PageBrowsePreviewProps {
  pageId: number;
  revision: string;
}

const PREVIEW_CACHE_LIMIT = 24;
const previewCache = new Map<string, PagePreviewResponse>();

function cacheKey(pageId: number, revision: string) {
  return `${pageId}:${revision}`;
}

function readCachedPreview(key: string) {
  const cached = previewCache.get(key);
  if (!cached) return undefined;
  previewCache.delete(key);
  previewCache.set(key, cached);
  return cached;
}

function cachePreview(key: string, preview: PagePreviewResponse) {
  previewCache.set(key, preview);
  while (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next().value;
    if (oldest === undefined) break;
    previewCache.delete(oldest);
  }
}

export function clearPagePreviewCacheForTests() {
  previewCache.clear();
}

function parseSections(content: string): PageSection[] {
  try {
    const value = JSON.parse(content);
    return Array.isArray(value) ? (value as PageSection[]) : [];
  } catch {
    return [];
  }
}

function PreviewSkeleton() {
  return (
    <SkeletonContent className="cp-preview-skeleton" label="Preview available on request">
      <SkeletonPrimitive shape="media" height={62} />
      <SkeletonPrimitive shape="heading" width="52%" />
      <SkeletonText lines={2} widths={["78%", "60%"]} />
    </SkeletonContent>
  );
}

const noop = () => {};

export function PageBrowsePreview({ pageId, revision }: PageBrowsePreviewProps) {
  const key = cacheKey(pageId, revision);
  const [preview, setPreview] = useState<PagePreviewResponse | null>(
    () => readCachedPreview(key) ?? null
  );
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [previewRoot, setPreviewRoot] = useState<HTMLDivElement | null>(null);
  const viewport = useViewportActivation({ rootMargin: "160px 0px" });
  const intent = useIntentActivation({ delayMs: 220 });
  const shouldLoad = viewport.active && intent.active;

  useEffect(() => {
    setPreview(readCachedPreview(key) ?? null);
    setError(false);
  }, [key]);

  useEffect(() => {
    if (!shouldLoad || preview) return;
    const cached = readCachedPreview(key);
    if (cached) {
      setPreview(cached);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setError(false);
    apiRequest<PagePreviewResponse>(`/pages/browse/${pageId}/preview`, {
      signal: controller.signal,
    }).then(
      value => {
        if (!current || value.id !== pageId) return;
        if (value.updated_at !== revision) {
          setError(true);
          return;
        }
        cachePreview(key, value);
        setPreview(value);
      },
      requestError => {
        if (current && requestError?.name !== "AbortError") setError(true);
      }
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [key, pageId, preview, retry, revision, shouldLoad]);

  const sections = useMemo(() => parseSections(preview?.content ?? "[]"), [preview?.content]);
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      viewport.ref(node);
      setPreviewRoot(node);
    },
    [viewport.ref]
  );

  return (
    <div ref={setRoot} className="cp-card__thumb" data-custom-page-preview {...intent.intentProps}>
      {!preview ? <PreviewSkeleton /> : null}
      {!intent.active && (
        <button
          type="button"
          className="cp-preview-load"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            viewport.activate();
            intent.activate();
          }}
        >
          Load preview
        </button>
      )}
      {shouldLoad && error && (
        <div className="cp-card__thumb-empty" role="alert">
          <span>Preview could not load.</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              setRetry(value => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {preview && !error && sections.length === 0 && (
        <div className="cp-card__thumb-empty">No preview content</div>
      )}
      {preview && !error && sections.length > 0 && (
        <div
          className="cp-card__thumb-inner"
          aria-hidden="true"
          ref={node => node?.setAttribute("inert", "")}
        >
          <AsyncBoundary label="Page preview" resetKeys={[key, retry]}>
            <Suspense fallback={<SectionSkeleton section={sections[0]} />}>
              <BlockRenderer
                sections={sections}
                canEdit={false}
                onUpdateSection={noop}
                onDeleteSection={noop}
                onCreateSection={noop}
                onCreateItem={noop}
                onUpdateItem={noop}
                onDeleteItem={noop}
                onMoveSection={noop}
                pageKey={`preview:${pageId}:${revision}`}
                preview
                viewportRoot={previewRoot}
              />
            </Suspense>
          </AsyncBoundary>
        </div>
      )}
    </div>
  );
}
