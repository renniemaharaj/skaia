/**
 * tsrunner/execute.js
 *
 * Reads a JSON payload from stdin:
 *   { "source": "<TypeScript code>", "env": { "KEY": "VALUE", ... } }
 *
 * 1. Compiles TypeScript → JavaScript
 * 2. Executes the compiled JS in a sandboxed VM context with:
 *    - `env` object containing injected environment variables
 *    - `fetch` function for HTTP requests
 * 3. Writes JSON result to stdout:
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

async function main() {
  const raw = await readStdin();
  const input = JSON.parse(raw);
  const source = input.source || "";
  const envVars = input.env || {};

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

  const result = ts.transpileModule(source, {
    compilerOptions,
    reportDiagnostics: true,
    fileName: "datasource.ts",
  });

  const diagnostics = (result.diagnostics || []).map((d) => {
    const pos =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : null;
    return {
      line: pos ? pos.line + 1 : 0,
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
    // Freeze the env object so the script cannot modify it
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
