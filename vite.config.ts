import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "browser-release-security",
      transformIndexHtml(html) {
        return mode === "browser"
          ? html.replace(
              "<head>",
              `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"><meta name="referrer" content="no-referrer"><meta name="guidecheck-build" content="${/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : "local"}">`,
            )
          : html;
      },
    },
  ],
  base: process.env.VITE_BASE_PATH ?? "/",
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: { outDir: mode === "browser" ? "dist-browser" : "dist" },
}));
