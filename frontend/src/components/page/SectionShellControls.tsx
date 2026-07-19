import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ColorPickerButton } from "./EditControls";
import { isSafeSectionColor } from "./sectionTheme";
import type { PageTheme, SharedSectionShell } from "./types";

type ColorSource = SharedSectionShell["background_color"];
type ColorField = "background_color" | "text_color" | "h1_color" | "h2_color" | "h3_color";
type PopoverPlacement = "top" | "bottom";

interface SectionShellControlsProps {
  shell: SharedSectionShell;
  theme: PageTheme;
  onChange: (shell: SharedSectionShell) => void;
}

interface AnchoredPanelPosition {
  top: number;
  left: number;
  maxHeight: number;
  placement: PopoverPlacement;
}

const POPOVER_GAP = 8;
const VIEWPORT_PADDING = 8;
const POPOVER_WIDTH = 360;

const colorFields: Array<{ key: ColorField; label: string }> = [
  { key: "background_color", label: "Background" },
  { key: "text_color", label: "Text" },
  { key: "h1_color", label: "H1" },
  { key: "h2_color", label: "H2" },
  { key: "h3_color", label: "H3" },
];

/**
 * Places a fixed panel beside its trigger without crossing viewport edges.
 * It prefers the trigger's lower edge, flips above when that side has more room,
 * and constrains the panel to the available vertical space when neither side fits.
 */
export function getAnchoredPanelPosition(
  anchor: Pick<DOMRect, "top" | "right" | "bottom">,
  panel: Pick<DOMRect, "width" | "height">,
  viewport: { width: number; height: number }
): AnchoredPanelPosition {
  const maxPanelWidth = Math.max(0, viewport.width - VIEWPORT_PADDING * 2);
  const panelWidth = Math.min(panel.width || POPOVER_WIDTH, maxPanelWidth);
  const panelHeight = Math.min(panel.height, Math.max(0, viewport.height - VIEWPORT_PADDING * 2));
  const roomBelow = Math.max(0, viewport.height - anchor.bottom - POPOVER_GAP - VIEWPORT_PADDING);
  const roomAbove = Math.max(0, anchor.top - POPOVER_GAP - VIEWPORT_PADDING);
  const placement: PopoverPlacement =
    panelHeight <= roomBelow || roomBelow >= roomAbove ? "bottom" : "top";
  const maxHeight = placement === "bottom" ? roomBelow : roomAbove;
  const visibleHeight = Math.min(panelHeight, maxHeight);
  const top =
    placement === "bottom"
      ? anchor.bottom + POPOVER_GAP
      : Math.max(VIEWPORT_PADDING, anchor.top - POPOVER_GAP - visibleHeight);
  const maximumLeft = Math.max(VIEWPORT_PADDING, viewport.width - VIEWPORT_PADDING - panelWidth);
  const left = Math.min(Math.max(anchor.right - panelWidth, VIEWPORT_PADDING), maximumLeft);

  return { top, left, maxHeight, placement };
}

function rawColor(source: ColorSource, theme: PageTheme): string | undefined {
  if (source.mode === "literal") return source.value;
  if (source.mode === "palette") {
    return theme.tokens.find(token => token.key === source.token)?.value;
  }
  return undefined;
}

function ColorSourceControl({
  label,
  value,
  theme,
  onChange,
}: {
  label: string;
  value: ColorSource;
  theme: PageTheme;
  onChange: (value: ColorSource) => void;
}) {
  const resolvedColor = rawColor(value, theme);

  return (
    <div className="section-shell-color-row">
      <span className="section-shell-control-label">{label}</span>
      <select
        aria-label={`${label} color source`}
        value={value.mode}
        onChange={event => {
          const mode = event.target.value;
          if (mode === "literal") {
            const initialColor = resolvedColor;
            onChange({
              mode,
              value: initialColor && isSafeSectionColor(initialColor) ? initialColor : "#000000",
            });
          } else if (mode === "palette" && theme.tokens[0]) {
            onChange({ mode, token: theme.tokens[0].key });
          } else {
            onChange({ mode: "inherit" });
          }
        }}
      >
        <option value="inherit">Inherit</option>
        <option value="literal">Custom</option>
        {theme.tokens.length > 0 && <option value="palette">Palette</option>}
      </select>
      {value.mode === "literal" && (
        <div className="section-shell-color-value">
          <ColorPickerButton
            value={value.value}
            onChange={color => onChange({ mode: "literal", value: color })}
            title={`Pick ${label.toLowerCase()} color`}
          />
          <output title={value.value}>{value.value}</output>
        </div>
      )}
      {value.mode === "palette" && (
        <div className="section-shell-color-value">
          <span
            className="section-shell-palette-swatch"
            style={{ backgroundColor: resolvedColor }}
            aria-hidden="true"
          />
          <select
            aria-label={`${label} palette token`}
            value={value.token}
            onChange={event => onChange({ mode: "palette", token: event.target.value })}
          >
            {theme.tokens.map(token => (
              <option key={token.key} value={token.key}>
                {token.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {value.mode === "inherit" && <span className="section-shell-inherit-hint">From page</span>}
    </div>
  );
}

function hexLuminance(value: string): number | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return undefined;
  const hex = match[1].length === 3 ? [...match[1]].map(char => char + char).join("") : match[1];
  const channels = [0, 2, 4].map(
    offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  );
  const linear = channels.map(channel =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function hasLowContrast(shell: SharedSectionShell, theme: PageTheme): boolean {
  const background = hexLuminance(rawColor(shell.background_color, theme) ?? "");
  const text = hexLuminance(rawColor(shell.text_color, theme) ?? "");
  if (background === undefined || text === undefined) return false;
  const lighter = Math.max(background, text);
  const darker = Math.min(background, text);
  return (lighter + 0.05) / (darker + 0.05) < 4.5;
}

export function SectionShellControls({ shell, theme, onChange }: SectionShellControlsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<AnchoredPanelPosition | null>(null);
  const update = <K extends keyof SharedSectionShell>(key: K, value: SharedSectionShell[K]) =>
    onChange({ ...shell, [key]: value });

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    setPanelPosition(
      getAnchoredPanelPosition(trigger.getBoundingClientRect(), panel.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    setPanelPosition(null);
    updatePanelPosition();
    panelRef.current
      ?.querySelector<HTMLElement>("select, input:not([disabled]), button:not([disabled])")
      ?.focus();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handleOutsidePointer, {
      capture: true,
    });
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePanelPosition);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    if (panelRef.current) resizeObserver?.observe(panelRef.current);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer, {
        capture: true,
      });
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
      resizeObserver?.disconnect();
    };
  }, [open, updatePanelPosition]);

  const panelStyle: CSSProperties = panelPosition
    ? {
        top: panelPosition.top,
        left: panelPosition.left,
        maxHeight: panelPosition.maxHeight,
      }
    : { top: 0, left: 0, visibility: "hidden" };

  return (
    <div className="section-shell-controls">
      <button
        ref={triggerRef}
        type="button"
        className="pb-section-toolbar-btn section-shell-controls-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={event => {
          event.stopPropagation();
          setOpen(value => !value);
        }}
      >
        Appearance
      </button>
      {open &&
        document.body &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="section-shell-controls-panel"
            style={panelStyle}
            role="dialog"
            aria-label="Section appearance"
            data-placement={panelPosition?.placement}
          >
            <label>
              <span className="section-shell-control-label">Container</span>
              <select
                aria-label="Section container width"
                value={shell.container_width}
                onChange={event =>
                  update(
                    "container_width",
                    event.target.value as SharedSectionShell["container_width"]
                  )
                }
              >
                <option value="narrow">Narrow</option>
                <option value="content">Content</option>
                <option value="wide">Wide</option>
                <option value="full">Full</option>
              </select>
            </label>
            <label>
              <span className="section-shell-control-label">Content scale</span>
              <input
                style={{ padding: 0 }}
                aria-label="Section content scale"
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={shell.content_scale}
                onChange={event => update("content_scale", Number(event.target.value))}
              />
              <output>{shell.content_scale.toFixed(2)}×</output>
            </label>
            <div className="section-shell-controls-divider" />
            {colorFields.map(field => (
              <ColorSourceControl
                key={field.key}
                label={field.label}
                value={shell[field.key]}
                theme={theme}
                onChange={value => update(field.key, value)}
              />
            ))}
            {hasLowContrast(shell, theme) && (
              <p className="section-shell-contrast-warning" role="status">
                Background and text contrast is below 4.5:1.
              </p>
            )}
            <div className="section-shell-controls-divider" />
            <label className="section-shell-check">
              <input
                type="checkbox"
                checked={shell.collapsible}
                onChange={event => update("collapsible", event.target.checked)}
              />
              Collapsible
            </label>
            <label className="section-shell-check">
              <input
                type="checkbox"
                checked={shell.default_collapsed}
                disabled={!shell.collapsible}
                onChange={event => update("default_collapsed", event.target.checked)}
              />
              Collapsed by default
            </label>
          </div>,
          document.body
        )}
    </div>
  );
}
