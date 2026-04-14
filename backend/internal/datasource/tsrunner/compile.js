/**
 * tsrunner/compile.js
 *
 * Reads TypeScript source from stdin, compiles it to JavaScript using the
 * TypeScript compiler API, and writes a JSON result to stdout:
 *
 *   { "js": "<compiled code>", "diagnostics": [ { "line": 1, "col": 0, "message": "..." } ] }
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

async function main() {
  const source = await readStdin();

  /** @type {import("typescript").CompilerOptions} */
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: false,
    // Produce JS even if there are type errors
    noEmitOnError: false,
    // Isolate so we don't need a program, just transpileModule
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
      category: d.category, // 0=Warning, 1=Error, 2=Suggestion, 3=Message
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
