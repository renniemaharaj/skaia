import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const sourceExtensions = new Set([".ts", ".tsx"]);
const findings = [];

// These null fallbacks own optional decoration/overlays, not route-visible content.
const reviewedNullFallbacks = new Set([
  "pages/Layout.tsx",
  "components/page/layout/PresencePanel.tsx",
]);

const retiredInitialLoadingText = new Map([
  ["components/page/PageManageFormPage.tsx", ["Loading page settings…"]],
  ["components/page/datasources/DataSourceEditorPage.tsx", ["Loading data source…"]],
  ["components/user/UserProfile.tsx", ["Loading profile…"]],
  ["components/user/UserUploads.tsx", ["Loading uploads…"]],
  ["components/forum/ThreadsFeed.tsx", ["Loading threads…"]],
  ["components/activity/Activity.tsx", ["Loading activity…"]],
  ["pages/trash/TrashPage.tsx", ["Loading Trash…"]],
  ["components/admin/RolesManagementPage.tsx", ["Loading roles..."]],
  ["components/store/OrderViewPage.tsx", ["Loading order…"]],
  ["pages/documentation/DocumentationCatalogPage.tsx", ["Loading documentation..."]],
  ["pages/documentation/DocumentationViewPage.tsx", ["Loading documentation..."]],
  ["components/inbox/InboxPage.tsx", ["Loading messages…"]],
]);

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) continue;
    const name = relative(root, path);
    const source = await readFile(path, "utf8");

    if (!reviewedNullFallbacks.has(name) && /<Suspense\s+fallback=\{null\}/.test(source)) {
      findings.push(`${name}: visible Suspense boundary uses a null fallback`);
    }
    if (
      name !== "components/analytics/ResourceAnalytics.tsx" &&
      /from\s+["']recharts["']/.test(source)
    ) {
      findings.push(`${name}: Recharts must remain inside the intent-loaded analytics module`);
    }
    if (/import\s+ResourceAnalytics\s+from/.test(source)) {
      findings.push(`${name}: ResourceAnalytics must use React.lazy`);
    }
    for (const text of retiredInitialLoadingText.get(name) ?? []) {
      if (source.includes(text))
        findings.push(`${name}: restored bare initial loading text: ${text}`);
    }
  }
}

await walk(root);
if (findings.length > 0) {
  process.stderr.write(`Loading-boundary policy failed:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
}
