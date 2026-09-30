import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4392",
    channel: process.env.CI ? undefined : "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/tsx/dist/cli.mjs server/index.ts",
    url: "http://127.0.0.1:4392/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: "4392",
      GUIDECHECK_EMPTY: "1",
      GUIDECHECK_DB: join(
        tmpdir(),
        `guidecheck-browser-${randomUUID()}.sqlite`,
      ),
    },
  },
});
