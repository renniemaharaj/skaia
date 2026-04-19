/**
 * tsrunner/compile.js
 *
 * Reads a JSON payload from stdin:
 *   { "files": { "main.ts": "...", "helpers.ts": "..." } }
 *
 * 1. Merges all .ts files (alphabetically, main.ts last)
 * 2. Compiles the merged TypeScript => JavaScript
 * 3. Maps diagnostics back to original source files
 * 4. Writes JSON result to stdout:
 *   { "js": "<compiled code>", "diagnostics": [ { "file": "main.ts", "line": 1, ... } ] }
 *
 * Exit code 0 on success (even with diagnostics — caller decides severity).
 * Exit code 1 on fatal errors (e.g. missing TS module).
 */

const ts = require("typescript");

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

/**
 * Merge files into a single source string. Non-.ts files are skipped.
 * Files are sorted alphabetically with main.ts always last.
 * Returns { merged, offsets } where offsets maps back to original files.
 */
function mergeFiles(files) {
  const names = Object.keys(files)
    .filter((f) => f.endsWith(".ts"))
    .sort((a, b) => {
      if (a === "main.ts") return 1;
      if (b === "main.ts") return -1;
      return a.localeCompare(b);
    });

  const offsets = []; // { file, startLine, lineCount }
  let merged = "";
  let currentLine = 1;

  for (const name of names) {
    const content = files[name] || "";
    const lineCount = content.split("\n").length;
    offsets.push({ file: name, startLine: currentLine, lineCount });
    merged += content + "\n";
    currentLine += lineCount;
  }

  return { merged, offsets, order: names };
}

/**
 * Map a merged-source line number back to the original file + local line.
 */
function mapLineToFile(line, offsets) {
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (line >= offsets[i].startLine) {
      return {
        file: offsets[i].file,
        line: line - offsets[i].startLine + 1,
      };
    }
  }
  return { file: "main.ts", line };
}

async function main() {
  const raw = await readStdin();
  const input = JSON.parse(raw);
  const files = input.files || {};

  // Fallback: legacy single-source mode
  if (Object.keys(files).length === 0 && input.source) {
    files["main.ts"] = input.source;
  }

  const { merged, offsets } = mergeFiles(files);

  /** @type {import("typescript").CompilerOptions} */
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: false,
    noEmitOnError: false,
    isolatedModules: true,
  };

  const result = ts.transpileModule(merged, {
    compilerOptions,
    reportDiagnostics: true,
    fileName: "datasource.ts",
  });

  const diagnostics = (result.diagnostics || []).map((d) => {
    const pos =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : null;
    const mergedLine = pos ? pos.line + 1 : 0;
    const mapped =
      mergedLine > 0
        ? mapLineToFile(mergedLine, offsets)
        : { file: "main.ts", line: 0 };
    return {
      file: mapped.file,
      line: mapped.line,
      col: pos ? pos.character : 0,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      category: d.category,
    };
  });

  const output = {
    js: result.outputText,
    diagnostics,
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  process.stderr.write(err.message || String(err));
  process.exit(1);
});
