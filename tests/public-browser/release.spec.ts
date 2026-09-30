import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseImport } from "../../src/core.ts";
import { parseWorkspaceBackup } from "../../src/workspace.ts";
import { addGuide, workspaceBackup } from "../../src/workspace.ts";
import { type Workspace } from "../../src/core.ts";

test("backup selection ignores an earlier slow file read and binds confirmation to the latest preview", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      const result = await read.call(this);
      if (this.name === "slow.json")
        await new Promise((resolve) => setTimeout(resolve, 750));
      return result;
    };
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  const snapshot: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  const slow = JSON.stringify(workspaceBackup(snapshot));
  addGuide(snapshot, {
    title: "Latest selection",
    owner: "Synthetic QA",
    description: "",
    steps: [
      {
        id: "latest",
        title: "Latest step",
        text: "Synthetic fixture",
        links: [],
        screenshots: [],
      },
    ],
  });
  const fast = JSON.stringify(workspaceBackup(snapshot));
  const field = page.getByLabel("GuideCheck workspace backup");
  await field.setInputFiles({
    name: "slow.json",
    mimeType: "application/json",
    buffer: Buffer.from(slow),
  });
  await field.setInputFiles({
    name: "fast.json",
    mimeType: "application/json",
    buffer: Buffer.from(fast),
  });
  await expect(page.locator(".import-preview")).toContainText("1 guide");
  await page.getByLabel("I have saved a current backup").check();
  await expect(page.locator(".import-preview")).toContainText("1 guide");
  await page.waitForTimeout(850);
  await expect(page.locator(".import-preview")).toContainText("1 guide");
  await page
    .getByRole("button", { name: "Restore workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Latest selection", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  await field.setInputFiles({
    name: "next.json",
    mimeType: "application/json",
    buffer: Buffer.from(slow),
  });
  await expect(page.locator(".import-preview")).toContainText("0 guides");
  await expect(
    page.getByLabel("I have saved a current backup"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Restore workspace", exact: true }),
  ).toBeDisabled();
});
test("public golden path: private import, revision, review, backup, reload, cross-visitor isolation and restore", async ({
  page,
  browser,
}) => {
  const failures: string[] = [];
  const uploads: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("request", (r) => {
    if (r.method() !== "GET") uploads.push(r.url());
  });
  await page.goto("./");
  await expect(page.getByText("SYNTHETIC DEMO", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  const original = JSON.parse(
    readFileSync(resolve("fixtures/invoice-v1.json"), "utf8"),
  );
  original.title = "Private browser golden path";
  await page.getByLabel("Guide content").fill(JSON.stringify(original));
  await page.getByRole("button", { name: "Check import" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: original.title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import revision", exact: true })
    .click();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  const updated = JSON.parse(
    readFileSync(resolve("fixtures/invoice-v2.json"), "utf8"),
  );
  updated.title = original.title;
  await page.getByLabel("Guide content").fill(JSON.stringify(updated));
  await page
    .getByLabel("Version note", { exact: true })
    .fill("Original synthetic evidence update");
  await page.getByRole("button", { name: "Check import" }).click();
  await page.getByRole("button", { name: "Create version" }).click();
  await expect(page.locator(".change-count")).toContainText("2 changed steps");
  await page.getByLabel("Reviewer", { exact: true }).fill("Public QA");
  await page
    .getByLabel("Environment / evidence source")
    .fill("Original synthetic fixture");
  await page
    .getByLabel("What did you test and observe?")
    .fill("Observed expected navigation in the fictional QA environment.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByRole("status")).toContainText("Review saved");
  await page.locator(".export-menu summary").click();
  const guideDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Guide · Markdown" }).click();
  const guideFile = await guideDownload;
  await guideFile.saveAs("test-results/public-guide.md");
  expect(
    parseImport(
      readFileSync("test-results/public-guide.md", "utf8"),
      "markdown",
    ).title,
  ).toBe(original.title);
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download complete backup" }).click();
  const backup = await backupDownload;
  await backup.saveAs("test-results/public-workspace-backup.json");
  const snapshot = parseWorkspaceBackup(
    readFileSync("test-results/public-workspace-backup.json", "utf8"),
  );
  expect(snapshot.guides).toHaveLength(3);
  expect(snapshot.guides.at(-1)!.reviews[0].reviewer).toBe("Public QA");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: new RegExp(original.title) }).click();
  await page.getByLabel("Filter steps").selectOption("tested");
  await expect(page.getByText("Tested by Public QA")).toBeVisible();
  const otherContext = await browser.newContext();
  const visitor = await otherContext.newPage();
  await visitor.goto(page.url());
  await expect(
    visitor.getByRole("heading", {
      name: "Export a customer invoice",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: new RegExp(original.title) }),
  ).toHaveCount(0);
  await visitor
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  await visitor
    .getByLabel("GuideCheck workspace backup")
    .setInputFiles(resolve("test-results/public-workspace-backup.json"));
  await visitor.getByLabel("I have saved a current backup").check();
  await visitor
    .getByRole("button", { name: "Restore workspace", exact: true })
    .click();
  await expect(visitor.getByRole("status")).toContainText("Workspace restored");
  await visitor
    .getByRole("button", { name: new RegExp(original.title) })
    .click();
  await visitor.getByLabel("Filter steps").selectOption("tested");
  await expect(visitor.getByText("Tested by Public QA")).toBeVisible();
  await visitor.reload();
  await visitor
    .getByRole("button", { name: new RegExp(original.title) })
    .click();
  await visitor.getByLabel("Filter steps").selectOption("tested");
  await expect(visitor.getByText("Tested by Public QA")).toBeVisible();
  await otherContext.close();
  expect(failures).toEqual([]);
  expect(uploads).toEqual([]);
});
test("public responsive/keyboard/storage failure and malformed backup states", async ({
  page,
}) => {
  await page.goto("./");
  for (const width of [375, 400, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("GuideCheck workspace backup").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Invalid workspace backup",
  );
  await expect(
    page.getByRole("button", { name: "Restore workspace", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Backup & restore", exact: true }),
  ).toBeFocused();
  await page.addInitScript(() =>
    Object.defineProperty(globalThis, "indexedDB", {
      get() {
        return undefined;
      },
    }),
  );
  await page.reload();
  await expect(page.getByText("Workspace unavailable")).toBeVisible();
  await expect(
    page.getByText("No temporary workspace was substituted.", { exact: false }),
  ).toBeVisible();
});
