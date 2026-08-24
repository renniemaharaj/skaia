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
const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");

const MAX_FETCH_URL_BYTES = 4096;
const MAX_FETCH_REQUEST_BYTES = 256 * 1024;
const MAX_FETCH_RESPONSE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_FETCH_REDIRECTS = 4;

function isBlockedIPv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIPAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isBlockedIPv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) return true;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    /^fe[c-f]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

async function resolvePublicAddress(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("private network destinations are not allowed");
  }
  const literalFamily = net.isIP(normalized);
  const addresses = literalFamily
    ? [{ address: normalized, family: literalFamily }]
    : await dns.lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIPAddress(address))) {
    throw new Error("private network destinations are not allowed");
  }
  return addresses[0];
}

function requestOnce(url, request, resolved) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const headers = { ...request.headers };
    for (const name of Object.keys(headers)) {
      if (
        ["host", "connection", "content-length", "transfer-encoding", "accept-encoding"].includes(
          name.toLowerCase(),
        )
      ) {
        delete headers[name];
      }
    }
    headers["accept-encoding"] = "identity";
    if (request.body !== undefined) {
      headers["content-length"] = Buffer.byteLength(request.body);
    }
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
        lookup: (_hostname, options, callback) => {
          if (options?.all) callback(null, [resolved]);
          else callback(null, resolved.address, resolved.family);
        },
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if (location && [301, 302, 303, 307, 308].includes(status)) {
          response.resume();
          resolve({ redirect: location, status });
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_FETCH_RESPONSE_BYTES) {
            response.destroy(new Error("outbound response exceeds 2 MiB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const responseHeaders = Object.entries(response.headers).map(([name, value]) => [
            name,
            Array.isArray(value) ? value.join(", ") : String(value ?? ""),
          ]);
          resolve({
            url: url.href,
            status,
            statusText: response.statusMessage || "",
            headers: responseHeaders,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", reject);
      },
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("outbound request timed out")));
    req.on("error", reject);
    if (request.body !== undefined) req.write(request.body);
    req.end();
  });
}

async function secureFetch(request) {
  let currentURL = new URL(request.url);
  let method = request.method;
  let body = request.body;
  let headers = { ...request.headers };
  if (!new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).has(method)) {
    throw new Error("outbound request method is not allowed");
  }
  for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount++) {
    if (
      (currentURL.protocol !== "http:" && currentURL.protocol !== "https:") ||
      currentURL.username ||
      currentURL.password
    ) {
      throw new Error("outbound requests require credential-free http or https URLs");
    }
    const resolved = await resolvePublicAddress(currentURL.hostname);
    const response = await requestOnce(currentURL, { method, body, headers }, resolved);
    if (!response.redirect) return response;
    if (redirectCount === MAX_FETCH_REDIRECTS) {
      throw new Error("outbound request exceeded redirect limit");
    }
    const nextURL = new URL(response.redirect, currentURL);
    if (nextURL.origin !== currentURL.origin) {
      const nextHeaders = { ...headers };
      for (const name of Object.keys(nextHeaders)) {
        if (["authorization", "cookie", "proxy-authorization"].includes(name.toLowerCase())) {
          delete nextHeaders[name];
        }
      }
      headers = nextHeaders;
    }
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
    }
    currentURL = nextURL;
  }
  throw new Error("outbound request failed");
}

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
  const includePreviewDetails = input.includePreviewDetails === true;
  const fetchLog = [];

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
    // The VM never receives a host function or host object directly. The bridge
    // accepts and returns JSON strings only; a context-created fetch facade hides
    // it from datasource code and creates context-owned response objects.
    const fetchBridge = async (serializedRequest) => {
      const startedAt = Date.now();
      let request = null;
      try {
        if (
          typeof serializedRequest !== "string" ||
          Buffer.byteLength(serializedRequest) > MAX_FETCH_REQUEST_BYTES
        ) {
          throw new Error("outbound request is too large");
        }
        request = JSON.parse(serializedRequest);
        if (
          !request ||
          typeof request.url !== "string" ||
          Buffer.byteLength(request.url) > MAX_FETCH_URL_BYTES
        ) {
          throw new Error("outbound request URL is invalid");
        }
        const response = await secureFetch(request);
        if (includePreviewDetails) {
          fetchLog.push({
            url: request.url,
            method: request.method,
            status: response.status,
            statusText: response.statusText,
            duration: Date.now() - startedAt,
          });
        }
        return JSON.stringify({
          ok: true,
          response: {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: response.body,
          },
        });
      } catch (err) {
        const message = err?.message || String(err);
        if (includePreviewDetails) {
          fetchLog.push({
            url: request?.url || "",
            method: request?.method || "GET",
            duration: Date.now() - startedAt,
            error: message,
          });
        }
        return JSON.stringify({ ok: false, error: message });
      }
    };

    const context = vm.createContext(
      Object.assign(Object.create(null), {
        __skaiaFetchBridge: fetchBridge,
        __skaiaEnvJSON: JSON.stringify(envVars),
      }),
      { codeGeneration: { strings: false, wasm: false } },
    );

    const bootstrap = new vm.Script(`
      (() => {
        "use strict";
        const bridge = globalThis.__skaiaFetchBridge;
        const parsedEnv = JSON.parse(globalThis.__skaiaEnvJSON);
        delete globalThis.__skaiaFetchBridge;
        delete globalThis.__skaiaEnvJSON;

        const frozenEnv = Object.freeze({ ...parsedEnv });
        Object.defineProperty(globalThis, "env", {
          value: frozenEnv,
          writable: false,
          configurable: false,
        });
        for (const [key, value] of Object.entries(frozenEnv)) {
          if (!(key in globalThis)) {
            Object.defineProperty(globalThis, key, {
              value,
              writable: false,
              configurable: false,
            });
          }
        }

        const createHeaders = pairs => {
          const normalized = new Map(
            pairs.map(([name, value]) => [String(name).toLowerCase(), String(value)])
          );
          return Object.freeze({
            get: name => normalized.get(String(name).toLowerCase()) ?? null,
            has: name => normalized.has(String(name).toLowerCase()),
            entries: () => normalized.entries(),
            forEach: callback => normalized.forEach((value, name) => callback(value, name)),
            [Symbol.iterator]: () => normalized.entries(),
          });
        };

        const createResponse = payload => {
          let bodyUsed = false;
          const consume = () => {
            if (bodyUsed) throw new TypeError("Body is unusable");
            bodyUsed = true;
            return payload.body;
          };
          return Object.freeze({
            ok: payload.status >= 200 && payload.status < 300,
            status: payload.status,
            statusText: payload.statusText,
            url: payload.url,
            redirected: false,
            type: "basic",
            headers: createHeaders(payload.headers),
            get bodyUsed() { return bodyUsed; },
            text: async () => consume(),
            json: async () => JSON.parse(consume()),
            clone: () => createResponse(payload),
          });
        };

        const safeFetch = async (input, init = {}) => {
          const url =
            typeof input === "string"
              ? input
              : typeof input?.href === "string"
                ? input.href
                : typeof input?.url === "string"
                  ? input.url
                  : String(input);
          const method = String(init.method || input?.method || "GET").toUpperCase();
          const headerInput = init.headers || input?.headers || {};
          const headers = {};
          if (Array.isArray(headerInput)) {
            for (const pair of headerInput) {
              if (Array.isArray(pair) && pair.length === 2) headers[String(pair[0])] = String(pair[1]);
            }
          } else if (headerInput && typeof headerInput.forEach === "function") {
            headerInput.forEach((value, name) => { headers[String(name)] = String(value); });
          } else if (headerInput && typeof headerInput === "object") {
            for (const [name, value] of Object.entries(headerInput)) headers[String(name)] = String(value);
          }
          const body = init.body === undefined || init.body === null ? undefined : String(init.body);
          const serializedResult = await bridge(JSON.stringify({ url, method, headers, body }));
          const result = JSON.parse(serializedResult);
          if (!result.ok) throw new TypeError(result.error || "outbound request failed");
          return createResponse(result.response);
        };
        Object.defineProperty(globalThis, "fetch", {
          value: Object.freeze(safeFetch),
          writable: false,
          configurable: false,
        });
      })();
    `);
    bootstrap.runInContext(context, { timeout: 1000 });

    const wrappedCode = `
      (async () => {
        "use strict";
        ${result.outputText}
      })()
    `;

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

    process.stdout.write(
      JSON.stringify({
        data,
        diagnostics,
        ...(includePreviewDetails
          ? { js: result.outputText, fetch_log: fetchLog }
          : {}),
      }),
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        data: null,
        diagnostics,
        error: err.message || String(err),
        ...(includePreviewDetails
          ? { js: result.outputText, fetch_log: fetchLog }
          : {}),
      }),
    );
  }
}

main().catch((err) => {
  process.stderr.write(err.message || String(err));
  process.exit(1);
});
