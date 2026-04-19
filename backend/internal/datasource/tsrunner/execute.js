/**
 * tsrunner/execute.js
 *
 * Reads a JSON payload from stdin:
 *   { "files": { "main.ts": "...", "helpers.ts": "..." }, "env": { "KEY": "VALUE", ... } }
 *
 * 1. Merges all .ts files (alphabetically, main.ts last)
 * 2. Compiles merged TypeScript => JavaScript
 * 3. Executes the compiled JS in a sandboxed VM context with:
 *    - `env` object containing injected environment variables
 *    - `fetch` function for HTTP requests
 * 4. Writes JSON result to stdout:
 *   { "data": [...], "diagnostics": [...] }
 *
 * Exit code 0 on success; exit code 1 on fatal errors.
 */

const ts = require("typescript");
const vm = require("vm");

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
 */
function mergeFiles(files) {
  const names = Object.keys(files)
    .filter((f) => f.endsWith(".ts"))
    .sort((a, b) => {
      if (a === "main.ts") return 1;
      if (b === "main.ts") return -1;
      return a.localeCompare(b);
    });

  const offsets = [];
  let merged = "";
  let currentLine = 1;

  for (const name of names) {
    const content = files[name] || "";
    const lineCount = content.split("\n").length;
    offsets.push({ file: name, startLine: currentLine, lineCount });
    merged += content + "\n";
    currentLine += lineCount;
  }

  return { merged, offsets };
}

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
  const envVars = input.env || {};

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

  // Check for compilation errors
  const errors = diagnostics.filter((d) => d.category === 1);
  if (errors.length > 0) {
    process.stdout.write(
      JSON.stringify({ data: null, diagnostics, error: errors[0].message }),
    );
    return;
  }

  // Execute the compiled JS in a sandboxed context
  try {
    const frozenEnv = Object.freeze({ ...envVars });

    const wrappedCode = `
      (async () => {
        "use strict";
        ${result.outputText}
      })()
    `;

    const context = vm.createContext({
      ...envVars,
      env: frozenEnv,
      fetch: globalThis.fetch,
      console: { log() {}, warn() {}, error() {} },
      setTimeout,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Date,
      Math,
      RegExp,
      Map,
      Set,
      Promise,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    });

    const script = new vm.Script(wrappedCode, {
      filename: "datasource.ts",
      timeout: 8000,
    });

    const data = await script.runInContext(context, { timeout: 8000 });

    if (!Array.isArray(data)) {
      process.stdout.write(
        JSON.stringify({
          data: null,
          diagnostics,
          error: "Data source code must return an array",
        }),
      );
      return;
    }

    process.stdout.write(JSON.stringify({ data, diagnostics }));
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        data: null,
        diagnostics,
        error: err.message || String(err),
      }),
    );
  }
}

main().catch((err) => {
  process.stderr.write(err.message || String(err));
  process.exit(1);
});
