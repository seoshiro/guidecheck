import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const url = process.env.GUIDECHECK_CAPTURE_URL ?? "http://127.0.0.1:4381/";
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "msedge",
  headless: true,
});
try {
  mkdirSync("evidence", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
    deviceScaleFactor: 1,
  });
  const failures = [];
  const external = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith(new URL(url).origin) &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto(url);
  await page
    .getByRole("heading", { name: "Export a customer invoice", exact: true })
    .waitFor();
  assert.ok(
    await page.getByText("SYNTHETIC DEMO", { exact: true }).isVisible(),
  );
  await page.screenshot({
    path: "evidence/guidecheck-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Filter steps").selectOption("tested");
  await page.getByText("Carried evidence", { exact: false }).waitFor();
  const inherited = await page.locator(".evidence").innerText();
  assert.match(inherited, /Carried evidence/);
  assert.match(inherited, /UTC/);
  assert.match(inherited, /Originally recorded against version 1/);
  await page.getByLabel("Filter steps").selectOption("attention");
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "evidence/guidecheck-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(external, []);
  writeFileSync(
    "evidence/preview-check.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        url,
        syntheticSeedLabel: true,
        productionBrowserErrors: failures,
        externalBrowserRequests: external,
        inheritedTimestampExplicitUTC: true,
        inheritedOriginalVersionShown: true,
        mobile375pxWithoutDocumentOverflow: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Seeded production preview, original-version evidence timestamp, zero external requests, and desktop/mobile screenshots verified.",
  );
} finally {
  await browser.close();
}
