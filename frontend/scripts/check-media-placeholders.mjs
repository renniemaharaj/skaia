import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const rules = [
  { kind: "native media element", pattern: /<(?:img|video|audio)\b/g },
  { kind: "dynamic image background", pattern: /\bbackgroundImage\s*:/g },
  {
    kind: "generated image background",
    pattern: /background-image\s*:\s*url\(\s*["']?\$\{/g,
  },
];

// Every entry is reviewed. Migration entries are removed as their phase lands;
// durable entries describe lifecycle that MediaPlaceholder intentionally does not own.
const allowlist = new Map([
  ["components/ui/MediaPlaceholder.tsx", { count: 3, reason: "shared native media owner" }],
  ["components/ui/MediaBackground.tsx", { count: 1, reason: "shared repeat-image adapter" }],
  ["components/user/UserAvatar.tsx", { count: 1, reason: "compact initials/avatar fallback" }],
  ["components/bible/BookTile.tsx", { count: 2, reason: "bundled decorative page art" }],
  [
    "components/page/layout/voice/RemoteMedia.tsx",
    { count: 2, reason: "MediaStream.srcObject playback" },
  ],
  [
    "components/page/layout/voice/StreamMetaEditor.tsx",
    { count: 1, reason: "hidden MediaStream capture element" },
  ],
  [
    "components/page/blocks/CodeEditorBlock.tsx",
    { count: 1, reason: "generated Markdown HTML is adapted by RichTextRenderer" },
  ],
]);

const findings = new Map();

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) continue;

    const source = await readFile(absolutePath, "utf8");
    const sourcePath = relative(sourceRoot, absolutePath).split(sep).join("/");
    const matches = [];
    for (const rule of rules) {
      for (const match of source.matchAll(rule.pattern)) {
        matches.push({
          kind: rule.kind,
          line: source.slice(0, match.index).split("\n").length,
        });
      }
    }
    if (matches.length > 0) findings.set(sourcePath, matches);
  }
}

await walk(sourceRoot);

const errors = [];
for (const [sourcePath, matches] of findings) {
  const allowed = allowlist.get(sourcePath);
  if (!allowed) {
    for (const match of matches) errors.push(`${sourcePath}:${match.line}: ${match.kind}`);
    continue;
  }
  if (matches.length !== allowed.count) {
    errors.push(
      `${sourcePath}: expected ${allowed.count} reviewed occurrence(s), found ${matches.length} (${allowed.reason})`
    );
  }
}

for (const [sourcePath, allowed] of allowlist) {
  if (!findings.has(sourcePath)) {
    errors.push(`${sourcePath}: stale allowlist entry (${allowed.reason})`);
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `Unreviewed or drifted frontend media usage:\n${errors.join("\n")}\n` +
      "Use MediaPlaceholder/shared adapters, or add a narrowly reviewed exception with a reason.\n"
  );
  process.exitCode = 1;
}
