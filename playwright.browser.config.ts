import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/public-browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL:
      process.env.GUIDECHECK_LIVE_URL ?? "http://127.0.0.1:4394/guidecheck/",
    channel: process.env.CI ? undefined : "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(process.env.GUIDECHECK_LIVE_URL
    ? {}
    : {
        webServer: {
          command:
            "node node_modules/vite/bin/vite.js preview --mode browser --host 127.0.0.1 --port 4394 --strictPort",
          url: "http://127.0.0.1:4394/guidecheck/",
          reuseExistingServer: false,
          timeout: 30000,
          env: { VITE_BASE_PATH: "/guidecheck/" },
        },
      }),
});
