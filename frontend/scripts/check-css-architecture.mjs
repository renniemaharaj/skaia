import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const clipmakerPath = `${root}/src/pages/clipmaker/isolated-studio.css`;
const clipmaker = readFileSync(clipmakerPath, "utf8");
const sourceBoundaries = [
  {
    file: "src/components/page/deployments/DeploymentsPage.tsx",
    forbidden: ["OrdersPage.css"],
  },
  {
    file: "src/components/user/UserUploads.tsx",
    forbidden: ["DirectoryLayout.css", "UserProfile.css"],
  },
];

const uniqueClipmakerSelectors = [
  ".grid-auto-fit",
  ".backdrop-blur-sm",
  ".custom-scrollbar {",
  ".glow-purple",
  ".btn {",
  ".input-dark {",
  ".card {",
];

const repeated = uniqueClipmakerSelectors.filter(selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (clipmaker.match(new RegExp(escaped, "g")) ?? []).length !== 1;
});

if (repeated.length > 0) {
  console.error(
    `Clipmaker utility authority must contain each signature selector exactly once: ${repeated.join(", ")}`
  );
  process.exitCode = 1;
}

for (const boundary of sourceBoundaries) {
  const source = readFileSync(`${root}/${boundary.file}`, "utf8");
  const leaked = boundary.forbidden.filter(imported => source.includes(imported));
  if (leaked.length > 0) {
    console.error(`${boundary.file} imports cross-domain CSS: ${leaked.join(", ")}`);
    process.exitCode = 1;
  }
}
