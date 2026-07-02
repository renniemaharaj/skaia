const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { renderVideo } = require("@twick/renderer");

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function errorPayload(error, extra = {}) {
  return {
    status: "error",
    message: error?.message || String(error),
    stack: error?.stack || "",
    cause: error?.cause
      ? {
          message: error.cause.message || String(error.cause),
          stack: error.cause.stack || "",
        }
      : undefined,
    ...extra,
  };
}

function findChromium() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];

  return candidates.find((p) => fs.existsSync(p));
}

function testChromium(executablePath) {
  if (!executablePath) {
    return { ok: false, error: "No Chromium executable found" };
  }

  const result = spawnSync(
    executablePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "about:blank",
    ],
    {
      encoding: "utf8",
      timeout: 10000,
    },
  );

  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error ? result.error.message : "",
  };
}

function puppeteerSettings(workDir) {
  const executablePath = findChromium();

  return {
    ...(executablePath ? { executablePath } : {}),
    userDataDir: path.join(workDir, "chrome-profile"),
    dumpio: true,
    args: [
      "--headless=new",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-client-side-phishing-detection",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-hang-monitor",
      "--disable-popup-blocking",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--password-store=basic",
      "--use-mock-keychain",
    ],
  };
}

function rendererAliases(rendererDir) {
  const modulesDir = path.join(rendererDir, "node_modules");

  return {
    "@twick/renderer/lib/client/render": path.join(
      modulesDir,
      "@twick/renderer/lib/client/render.js",
    ),
    "@twick/core": path.join(modulesDir, "@twick/core/dist/index.js"),
    "@twick/effects": path.join(modulesDir, "@twick/effects/dist/index.js"),
    "@twick/2d": path.join(modulesDir, "@twick/2d/dist/index.js"),
    "@twick/2d/jsx-runtime": path.join(modulesDir, "@twick/2d/dist/index.js"),
    "@twick/visualizer/src": path.join(
      modulesDir,
      "@twick/visualizer/src/index.ts",
    ),
  };
}

async function readStdin() {
  const chunks = [];
  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join("");
}

async function main() {
  const rendererDir = __dirname;
  const workDir = path.resolve(
    process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "skaia-render-")),
  );
  const outFile = path.resolve(
    process.argv[3] || path.join(workDir, "output.mp4"),
  );

  mkdirp(workDir);
  mkdirp(path.dirname(outFile));

  const viteCacheDir = path.join(workDir, ".vite-cache");
  const tmpDir = path.join(workDir, "tmp");
  mkdirp(viteCacheDir);
  mkdirp(tmpDir);

  process.env.TMPDIR = tmpDir;
  process.env.TEMP = tmpDir;
  process.env.TMP = tmpDir;
  process.env.NODE_PATH = path.join(rendererDir, "node_modules");

  const projectData = JSON.parse(await readStdin());

  const projectFile = path.join(workDir, "project.tsx");
  fs.copyFileSync(path.join(rendererDir, "project.tsx"), projectFile);
  fs.writeFileSync(
    path.join(workDir, "project.json"),
    JSON.stringify(projectData, null, 2),
  );

  const chromium = findChromium();
  const chromiumTest = testChromium(chromium);

  if (!chromiumTest.ok) {
    console.error("Chromium launch test failed:", chromiumTest);
    console.log(
      JSON.stringify({
        status: "error",
        message: "Chromium failed to launch before rendering",
        chromium,
        chromiumTest,
      }),
    );
    process.exit(1);
  }

  try {
    const resultPath = await renderVideo({
      projectFile,
      settings: {
        outFile,
        logProgress: false,
        puppeteer: puppeteerSettings(workDir),
        viteConfig: {
          root: workDir,
          cacheDir: viteCacheDir,
          esbuild: {
            jsx: "automatic",
            jsxImportSource: "@twick/2d",
          },
          server: {
            fs: {
              allow: [workDir, rendererDir],
            },
          },
          resolve: {
            alias: rendererAliases(rendererDir),
            modules: [path.join(rendererDir, "node_modules"), "node_modules"],
          },
        },
      },
    });

    console.log(
      JSON.stringify({
        status: "success",
        file: resultPath || outFile,
      }),
    );
  } catch (error) {
    console.error("Render failed:", error);
    console.log(
      JSON.stringify(
        errorPayload(error, {
          chromium,
          workDir,
          outFile,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        }),
      ),
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal renderer error:", error);
  console.log(JSON.stringify(errorPayload(error)));
  process.exit(1);
});
