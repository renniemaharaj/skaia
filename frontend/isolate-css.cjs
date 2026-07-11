const fs = require("fs");

const path = "node_modules/@twick/studio/dist/studio.css";
let css = fs.readFileSync(path, "utf-8");

css = css.replace(/\*,/g, ".twick-isolated-container *,");
css = css.replace(/\*::before,/g, ".twick-isolated-container *::before,");
css = css.replace(/\*::after \{/g, ".twick-isolated-container *::after {");
css = css.replace(/\* \{/g, ".twick-isolated-container * {");
css = css.replace(/^body \{/gm, ".twick-isolated-container {");
css = css.replace(/^html \{/gm, ".twick-isolated-container-html {");
css = css.replace(/^::-webkit-scrollbar/gm, ".twick-isolated-container ::-webkit-scrollbar");
css = css.replace(/:root \{/g, ".twick-isolated-container {");

// Theme Variable Mapping: Backgrounds
css = css.replace(/rgba\(23,\s*23,\s*28,\s*0\.9[0-9]\)/g, "var(--bg-color)");
css = css.replace(/rgba\(18,\s*18,\s*23,\s*0\.9[0-9]\)/g, "var(--bg-secondary)");
css = css.replace(/rgba\(15,\s*23,\s*42,\s*0\.9\)/g, "var(--bg-tertiary)");
css = css.replace(/var\(--color-neutral-900\)/g, "var(--bg-color)");
css = css.replace(/var\(--color-neutral-800\)/g, "var(--bg-secondary)");
css = css.replace(/var\(--color-neutral-700\)/g, "var(--bg-tertiary)");
css = css.replace(
  /background-color: rgba\(0, 0, 0, 0\.7\)/g,
  "background-color: color-mix(in srgb, var(--bg-color) 70%, transparent)"
);
css = css.replace(/background:\s*#1e1e1e/g, "background: var(--bg-color)");
css = css.replace(/background-color:\s*#2a2a2a/g, "background-color: var(--bg-secondary)");

// Theme Variable Mapping: Text Colors
css = css.replace(/rgba\(226,\s*232,\s*240,\s*0\.9[0-9]\)/g, "var(--text-primary)");
css = css.replace(/rgba\(209,\s*213,\s*219,\s*0\.9\)/g, "var(--text-secondary)");
css = css.replace(/rgba\(148,\s*163,\s*184,\s*0\.[89][0-9]?\)/g, "var(--text-secondary)");
css = css.replace(/var\(--color-gray-100\)/g, "var(--text-primary)");
css = css.replace(/var\(--color-gray-200\)/g, "var(--text-primary)");
css = css.replace(/var\(--color-gray-300\)/g, "var(--text-secondary)");
css = css.replace(/var\(--color-gray-400\)/g, "var(--text-secondary)");
css = css.replace(/color:\s*white/g, "color: var(--text-primary)");
css = css.replace(/color:\s*#ffffff/g, "color: var(--text-primary)");

// Theme Variable Mapping: Borders
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.0[0-9]\)/g, "var(--border-color)");
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.1[0-9]?\)/g, "var(--border-color)");
css = css.replace(/rgba\(51,\s*65,\s*85,\s*0\.9\)/g, "var(--border-color)");
css = css.replace(/var\(--color-neutral-600\)/g, "var(--border-color)");

// Theme Variable Mapping: Accents (Primary Color)
css = css.replace(/var\(--color-purple-[456]00\)/g, "var(--primary-color)");
css = css.replace(
  /var\(--color-purple-700\)/g,
  "var(--primary-dark, color-mix(in srgb, var(--primary-color) 80%, black))"
);
css = css.replace(
  /rgba\(139,\s*92,\s*246,\s*0\.[28]\)/g,
  "color-mix(in srgb, var(--primary-color) 20%, transparent)"
);

css += `
/* ========================================
   FORCE DARK MODE FOR STUDIO
   ======================================== */
.twick-isolated-container {
  --primary-color: #7bb3a0;
  --primary-light: #9dd4bf;
  --primary-dark: #5b9e8e;
  --skaia-green-primary: #caffed;
  --secondary-color: #1a1a1a;
  --bg-color: #0f0f0f;
  --bg-color-rgb: 15, 15, 15;
  --bg-secondary: #1a1a1a;
  --bg-secondary-rgb: 26, 26, 26;
  --bg-tertiary: #252525;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --border-color: #333333;
  --shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-hover: 0 8px 16px rgba(0, 0, 0, 0.4);

  --card-bg: transparent;
  --card-border: var(--border-color);
  --card-radius: 0;
  --card-padding: 0.625rem;
  --card-shadow: none;
  --card-shadow-hover: none;
  --card-hover-bg: transparent;
  --section-bg: transparent;
  --section-gap: 0.625rem;
  --section-padding: 0.625rem;
  --panel-border: var(--border-color);
  --panel-heading-color: var(--text-primary);

  --color-bg-elevated: rgba(17, 20, 25, 0.92);
  --color-text-primary: var(--text-primary);
  --color-border: rgba(255, 255, 255, 0.1);

  --skeleton-color: #2a2a2a;
  --skeleton-shine: #333333;

  --error-color: #ff6b7a;
  --error-bg: rgba(255, 107, 122, 0.12);
  --error-border: rgba(255, 107, 122, 0.25);
  --success-color: #34c97a;
  --success-bg: rgba(52, 201, 122, 0.12);
  --warning-color: #ffaa44;
  --warning-bg: rgba(255, 170, 68, 0.12);
  --info-color: #60a5fa;
  --info-bg: rgba(96, 165, 250, 0.12);
  --success-border: rgba(52, 201, 122, 0.25);
  --color-primary: var(--primary-color);
  --color-success: var(--success-color);
  --color-danger: var(--error-color);

  --focus-ring: 0 0 0 3px rgba(123, 179, 160, 0.2);
  --overlay-dark: rgba(0, 0, 0, 0.6);
  --overlay-dark-heavy: rgba(0, 0, 0, 0.88);
  --scrollbar-thumb: rgba(255, 255, 255, 0.15);
}

`;
css += `
/* ========================================
   SKAIA BUTTON HIJACK OVERRIDES
   ======================================== */
.twick-isolated-container .btn-primary,
.twick-isolated-container .btn-ghost,
.twick-isolated-container .control-btn,
.twick-isolated-container .toolbar-btn,
.twick-isolated-container .media-action-btn,
.twick-isolated-container .media-action-btn-primary {
  font-family: var(--font-sans) !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  border-radius: var(--radius-md, 6px) !important;
}

/* User requested NO primary buttons, convert them all to secondary style! */
.twick-isolated-container .btn-primary,
.twick-isolated-container .media-action-btn,
.twick-isolated-container .media-action-btn-primary {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0.25rem !important;
  min-height: 28px !important;
  padding: 4px 12px !important;
  font-size: 0.78rem !important;
  font-weight: 500 !important;
  background-color: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
}

.twick-isolated-container .btn-primary:hover:not(:disabled),
.twick-isolated-container .media-action-btn:hover:not(:disabled),
.twick-isolated-container .media-action-btn-primary:hover:not(:disabled) {
  background-color: var(--bg-tertiary) !important;
  transform: translateY(-1px) !important;
  box-shadow: var(--shadow-sm) !important;
  border-color: color-mix(in srgb, var(--primary-color) 48%, var(--border-color)) !important;
}

/* Fix SVG sizing inside these hijacked media buttons */
.twick-isolated-container .media-action-btn svg,
.twick-isolated-container .media-action-btn-primary svg {
  width: 1.1rem !important;
  height: 1.1rem !important;
  flex-shrink: 0 !important;
}

.twick-isolated-container .btn-ghost {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0.25rem !important;
  min-height: 28px !important;
  padding: 4px 12px !important;
  font-size: 0.78rem !important;
  font-weight: 500 !important;
  background: transparent !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
}
.twick-isolated-container .btn-ghost:hover:not(:disabled) {
  background: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
}

.twick-isolated-container .control-btn:hover:not(:disabled),
.twick-isolated-container .toolbar-btn:hover:not(.active) {
  background-color: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border-radius: var(--radius-md, 6px) !important;
}

/* Active states mapped to secondary selected (or subtle primary) */
.twick-isolated-container .toolbar-btn.active,
.twick-isolated-container .follow-btn-active {
  background-color: var(--bg-tertiary) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius-md, 6px) !important;
}

.twick-isolated-container .toolbar-btn.active svg,
.twick-isolated-container .follow-btn-active svg,
.twick-isolated-container .toolbar-btn.active .toolbar-label {
  color: var(--text-primary) !important;
}

/* Also ensure Property Section labels match our typography */
.twick-isolated-container .property-label {
  font-family: var(--font-sans) !important;
  font-size: 0.75rem !important;
  color: var(--text-secondary) !important;
  font-weight: 500 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
}
.twick-isolated-container .properties-size-readonly {
  font-family: var(--font-sans) !important;
  color: var(--text-primary) !important;
  font-size: 0.85rem !important;
  font-weight: 500 !important;
}

/* Rename Studio Title and adjust margin */
.twick-isolated-container h1.text-gradient {
  margin-bottom: 0 !important;
  font-size: 0 !important;
}
.twick-isolated-container h1.text-gradient::after {
  content: "Clip Maker";
  font-size: 1.5rem;
  background: linear-gradient(to right, var(--primary-color), var(--primary-light));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  display: block;
}
`;

fs.writeFileSync("src/pages/clip-maker/isolated-studio.css", css);
console.log("Isolated CSS created");
