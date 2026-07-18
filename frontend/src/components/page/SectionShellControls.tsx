import { useEffect, useState } from "react";
import { isSafeSectionColor } from "./sectionTheme";
import type { PageTheme, SharedSectionShell } from "./types";

type ColorSource = SharedSectionShell["background_color"];
type ColorField = "background_color" | "text_color" | "h1_color" | "h2_color" | "h3_color";

interface SectionShellControlsProps {
  shell: SharedSectionShell;
  theme: PageTheme;
  onChange: (shell: SharedSectionShell) => void;
}

const colorFields: Array<{ key: ColorField; label: string }> = [
  { key: "background_color", label: "Background" },
  { key: "text_color", label: "Text" },
  { key: "h1_color", label: "H1" },
  { key: "h2_color", label: "H2" },
  { key: "h3_color", label: "H3" },
];

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
  const [draft, setDraft] = useState(value.mode === "literal" ? value.value : "");

  useEffect(() => {
    setDraft(value.mode === "literal" ? value.value : "");
  }, [value]);

  return (
    <div className="section-shell-color-row">
      <span>{label}</span>
      <select
        aria-label={`${label} color source`}
        value={value.mode}
        onChange={event => {
          const mode = event.target.value;
          if (mode === "literal") onChange({ mode, value: "#000000" });
          else if (mode === "palette" && theme.tokens[0]) {
            onChange({ mode, token: theme.tokens[0].key });
          } else onChange({ mode: "inherit" });
        }}
      >
        <option value="inherit">Inherit</option>
        <option value="literal">Literal</option>
        {theme.tokens.length > 0 && <option value="palette">Palette</option>}
      </select>
      {value.mode === "literal" && (
        <input
          aria-label={`${label} color value`}
          value={draft}
          aria-invalid={draft.length > 0 && !isSafeSectionColor(draft)}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => {
            if (isSafeSectionColor(draft)) onChange({ mode: "literal", value: draft });
            else setDraft(value.value);
          }}
          maxLength={128}
        />
      )}
      {value.mode === "palette" && (
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
      )}
    </div>
  );
}

function rawColor(source: ColorSource, theme: PageTheme): string | undefined {
  if (source.mode === "literal") return source.value;
  if (source.mode === "palette") {
    return theme.tokens.find(token => token.key === source.token)?.value;
  }
  return undefined;
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
  const update = <K extends keyof SharedSectionShell>(key: K, value: SharedSectionShell[K]) =>
    onChange({ ...shell, [key]: value });

  return (
    <details className="section-shell-controls">
      <summary className="pb-section-toolbar-btn">Appearance</summary>
      <div className="section-shell-controls-panel">
        <label>
          Container
          <select
            aria-label="Section container width"
            value={shell.container_width}
            onChange={event =>
              update("container_width", event.target.value as SharedSectionShell["container_width"])
            }
          >
            <option value="narrow">Narrow</option>
            <option value="content">Content</option>
            <option value="wide">Wide</option>
            <option value="full">Full</option>
          </select>
        </label>
        <label>
          Content scale
          <input
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
      </div>
    </details>
  );
}
