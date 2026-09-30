import { test, expect, chromium } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
test("browser workspace survives an actual browser process restart", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  const dir = mkdtempSync(join(tmpdir(), "guidecheck-profile-"));
  let context;
  const url = String(testInfo.project.use.baseURL);
  const options = {
    channel: process.env.CI ? undefined : "msedge",
    headless: true,
  };
  try {
    context = await chromium.launchPersistentContext(dir, options);
    let page = await context.newPage();
    await page.goto(url);
    await page
      .getByRole("button", { name: "Import guide", exact: true })
      .click();
    await page.getByLabel("Format", { exact: true }).selectOption("json");
    await page.getByLabel("Guide content").fill(
      JSON.stringify({
        title: "Browser restart fixture",
        owner: "Synthetic QA",
        steps: [
          {
            id: "restart",
            title: "Verify stored guide",
            text: "Original synthetic restart fixture.",
          },
        ],
      }),
    );
    await page.getByRole("button", { name: "Check import" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Import guide", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Browser restart fixture",
        exact: true,
      }),
    ).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(dir, options);
    page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: /Browser restart fixture/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "Browser restart fixture",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context?.close();
    assert.ok(dir.startsWith(join(tmpdir(), "guidecheck-profile-")));
    rmSync(dir, { recursive: true, force: true });
  }
});
