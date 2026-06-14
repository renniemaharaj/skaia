import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

const htmlDevPlugin = () => ({
  name: "html-transform",
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
});
