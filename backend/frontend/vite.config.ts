import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

const htmlDevPlugin = () => ({
  name: "html-transform",
  apply: "serve" as const,
  transformIndexHtml(html: string) {
    return html
      .replace("%TITLE_PLACEHOLDER%", "<title>Skaia Dev</title>")
      .replace("%META_DESCRIPTION_PLACEHOLDER%", "")
      .replace("%OG_IMAGE_PLACEHOLDER%", "")
      .replace("%FAVICON_PLACEHOLDER%", "");
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), htmlDevPlugin()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:80",
        changeOrigin: false,
      },
      "/ws": {
        target: "ws://localhost:80",
        ws: true,
        changeOrigin: false,
      },
      "/uploads": {
        target: "http://localhost:80",
        changeOrigin: false,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("reactjs-tiptap-editor")) {
              return "vendor-tiptap";
            }
            if (id.includes("@tiptap") || id.includes("prosemirror")) {
              return "vendor-tiptap-core";
            }
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            if (id.includes("@monaco-editor")) {
              return "vendor-monaco";
            }
            if (id.includes("lucide-react")) {
              return "vendor-lucide";
            }
            return "vendor";
          }
        },
      },
    },
  },
});
