import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const forbidden = /\b(window\.)?(confirm|prompt|alert)\s*\(|onbeforeunload|beforeunload/g;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) {
      continue;
    }
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(forbidden)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push(`${path}:${line}: ${match[0]}`);
    }
  }
}

await walk(root);
if (findings.length > 0) {
  process.stderr.write(`Native browser dialogs are forbidden:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
}
