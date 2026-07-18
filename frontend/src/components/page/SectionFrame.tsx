import type { CSSProperties, ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SectionMoveContext, SectionToolbar } from "./EditControls";
import { SectionShellControls } from "./SectionShellControls";
import { adaptLegacySectionShell, projectSharedShellToLegacyConfig } from "./sectionAdapter";
import { pageThemeVariables, resolveSectionColor } from "./sectionTheme";
import { SECTION_RENDERER_REGISTRY } from "./sectionRendererRegistry";
import {
  EMPTY_PAGE_THEME,
  SECTION_TYPE_LABELS,
  canonicalSectionType,
  type PageSection,
  type PageTheme,
  type SharedSectionShell,
} from "./types";

interface SectionFrameProps {
  section: PageSection;
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  onMove: (sectionId: number, direction: "up" | "down") => void;
  onUpdate: (section: PageSection) => void;
  onDelete: (id: number) => void;
  pageKey?: string;
  theme?: PageTheme;
  fallback?: ReactNode;
  children: ReactNode;
}

type SectionFrameStyle = CSSProperties &
  Partial<Record<`--skaia-${string}`, string | number | undefined>>;

/**
 * Shared outer shell for legacy-rendered sections during the typed migration.
 * It preserves the existing DOM while centralizing presentation and toolbar context.
 */
export function SectionFrame({
  section,
  isFirst,
  isLast,
  canEdit,
  onMove,
  onUpdate,
  onDelete,
  pageKey = "page",
  theme = EMPTY_PAGE_THEME,
  fallback,
  children,
}: SectionFrameProps) {
  const shell = useMemo(() => adaptLegacySectionShell(section.config), [section.config]);
  const [toolbarExtraTarget, setToolbarExtraTarget] = useState<Element | null>(null);
  const collapseIdentity = `${pageKey}:${section.id}:${section.revision ?? section.last_edited_by?.edited_at ?? section.config}`;
  const [collapsed, setCollapsed] = useState(shell.collapsible && shell.default_collapsed);

  useEffect(() => {
    setCollapsed(shell.collapsible && shell.default_collapsed);
  }, [collapseIdentity, shell.collapsible, shell.default_collapsed]);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(shell.animation === "none");
  const [outView, setOutView] = useState(false);

  useEffect(() => {
    if (shell.animation === "none") {
      setInView(true);
      setOutView(false);
      return;
    }
    const element = sectionRef.current;
    if (!element) return;
    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          setOutView(false);
        } else {
          setOutView(true);
          setInView(false);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shell.animation]);

  const sectionStyle: SectionFrameStyle = {
    ...(shell.margin_top ? { marginTop: `${shell.margin_top}px` } : {}),
    ...(shell.margin_right ? { marginRight: `${shell.margin_right}px` } : {}),
    ...(shell.margin_bottom ? { marginBottom: `${shell.margin_bottom}px` } : {}),
    ...(shell.margin_left ? { marginLeft: `${shell.margin_left}px` } : {}),
    ...(shell.padding_top ? { paddingTop: `${shell.padding_top}px` } : {}),
    ...(shell.padding_right ? { paddingRight: `${shell.padding_right}px` } : {}),
    ...(shell.padding_bottom ? { paddingBottom: `${shell.padding_bottom}px` } : {}),
    ...(shell.padding_left ? { paddingLeft: `${shell.padding_left}px` } : {}),
    ...pageThemeVariables(theme),
    backgroundColor: resolveSectionColor(shell.background_color, theme),
    color: resolveSectionColor(shell.text_color, theme),
    "--skaia-section-h1-color": resolveSectionColor(shell.h1_color, theme),
    "--skaia-section-h2-color": resolveSectionColor(shell.h2_color, theme),
    "--skaia-section-h3-color": resolveSectionColor(shell.h3_color, theme),
    "--skaia-section-content-scale": shell.content_scale,
  };

  const updateShell = useCallback(
    (nextShell: SharedSectionShell) => {
      onUpdate({
        ...section,
        config: projectSharedShellToLegacyConfig(section.config, nextShell),
      });
    },
    [onUpdate, section]
  );

  const onCopy = useCallback(async () => {
    try {
      const canonicalType = canonicalSectionType(section.section_type);
      const sanitized = canonicalType
        ? SECTION_RENDERER_REGISTRY[canonicalType].sanitizeForClipboard(section)
        : section;
      const payload = JSON.stringify({ isSkaiaBlock: true, section: sanitized });
      await navigator.clipboard.writeText(payload);
      toast.success("Section copied to clipboard");
    } catch {
      toast.error("Failed to copy section");
    }
  }, [section]);

  const onCut = useCallback(async () => {
    await onCopy();
    onDelete(section.id);
  }, [onCopy, onDelete, section.id]);

  const moveContext = useMemo(
    () => ({
      onMoveUp: () => onMove(section.id, "up"),
      onMoveDown: () => onMove(section.id, "down"),
      canMoveUp: !isFirst,
      canMoveDown: !isLast,
      lastEditedBy: section.last_edited_by,
      onCopy,
      onCut,
      frameOwnsToolbar: true,
      toolbarExtraTarget,
    }),
    [section.id, isFirst, isLast, onMove, section.last_edited_by, onCopy, onCut, toolbarExtraTarget]
  );

  const margins = {
    marginTop: shell.margin_top,
    marginRight: shell.margin_right,
    marginBottom: shell.margin_bottom,
    marginLeft: shell.margin_left,
    paddingTop: shell.padding_top,
    paddingRight: shell.padding_right,
    paddingBottom: shell.padding_bottom,
    paddingLeft: shell.padding_left,
  };
  const canonicalType = canonicalSectionType(section.section_type);
  const label = canonicalType
    ? (SECTION_TYPE_LABELS[canonicalType] ?? canonicalType)
    : `Unsupported: ${section.section_type || "missing"}`;
  const contentId = `section-content-${section.id}`;

  return (
    <SectionMoveContext.Provider value={moveContext}>
      <div
        ref={sectionRef}
        className={`pb-section-layout pb-section-layout-${shell.layout}`}
        style={sectionStyle}
        data-animation={shell.animation !== "none" ? shell.animation : undefined}
        data-intensity={shell.animation !== "none" ? shell.animation_intensity : undefined}
        data-in-view={inView ? "" : undefined}
        data-out-view={outView && !inView ? "" : undefined}
      >
        {canEdit && (
          <SectionToolbar
            onDelete={() => onDelete(section.id)}
            label={label}
            layout={shell.layout}
            onLayoutChange={layout => updateShell({ ...shell, layout })}
            margins={margins}
            onMarginsChange={next =>
              updateShell({
                ...shell,
                margin_top: next.marginTop ?? shell.margin_top,
                margin_right: next.marginRight ?? shell.margin_right,
                margin_bottom: next.marginBottom ?? shell.margin_bottom,
                margin_left: next.marginLeft ?? shell.margin_left,
                padding_top: next.paddingTop ?? shell.padding_top,
                padding_right: next.paddingRight ?? shell.padding_right,
                padding_bottom: next.paddingBottom ?? shell.padding_bottom,
                padding_left: next.paddingLeft ?? shell.padding_left,
              })
            }
            animation={shell.animation}
            onAnimationChange={animation => updateShell({ ...shell, animation })}
            animationIntensity={shell.animation_intensity}
            onAnimationIntensityChange={animation_intensity =>
              updateShell({ ...shell, animation_intensity })
            }
            extra={
              <>
                <SectionShellControls shell={shell} theme={theme} onChange={updateShell} />
                <span className="section-frame-extra-actions" ref={setToolbarExtraTarget} />
              </>
            }
          />
        )}
        {shell.collapsible && (
          <button
            type="button"
            className="section-frame-collapse"
            aria-expanded={!collapsed}
            aria-controls={contentId}
            onClick={() => setCollapsed(value => !value)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            <span>
              {collapsed
                ? `Expand ${section.heading || label}`
                : `Collapse ${section.heading || label}`}
            </span>
          </button>
        )}
        <div
          id={contentId}
          className={`pb-section-content pb-section-container-${shell.container_width}`}
          hidden={collapsed}
        >
          <Suspense fallback={fallback ?? null}>{children}</Suspense>
        </div>
      </div>
    </SectionMoveContext.Provider>
  );
}
