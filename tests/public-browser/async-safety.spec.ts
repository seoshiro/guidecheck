import { test, expect, type Page } from "@playwright/test";
import {
  addGuide,
  appendVersion,
  workspaceBackup,
  parseWorkspaceBackup,
} from "../../src/workspace.ts";
import type { Workspace } from "../../src/core.ts";

const fixture = (title: string) => ({
  title,
  owner: "Synthetic QA",
  description: "",
  steps: [
    {
      id: "settings",
      title: "Open settings",
      text: "Open Settings.",
      links: [],
      screenshots: [],
    },
  ],
});
async function importDraft(page: Page, title: string) {
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  await page.getByLabel("Guide content").fill(JSON.stringify(fixture(title)));
  await page.getByRole("button", { name: "Check import", exact: true }).click();
}
async function commitImport(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function slowCommit(page: Page) {
  await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      "oncomplete",
    )!;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      configurable: true,
      get: d.get,
      set(callback: (this: IDBTransaction, e: Event) => void) {
        d.set!.call(this, function (this: IDBTransaction, e: Event) {
          setTimeout(() => callback.call(this, e), 750);
        });
      },
    });
  });
}
test("latest selected JSON is previewed and saved, including uppercase extension", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      const value = await read.call(this);
      if (this.name === "slow.json")
        await new Promise((r) => setTimeout(r, 650));
      return value;
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  const files = page.getByLabel("Or choose a file");
  await files.setInputFiles({
    name: "slow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture("Slow stale file"))),
  });
  await files.setInputFiles({
    name: "FAST.JSON",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture("Latest selection"))),
  });
  await expect(page.getByLabel("Format", { exact: true })).toHaveValue("json");
  await expect(page.getByLabel("Guide content")).toHaveValue(
    /Latest selection/,
  );
  await page.getByRole("button", { name: "Check import", exact: true }).click();
  await page.waitForTimeout(800);
  await expect(page.locator(".import-preview")).toContainText(
    "Latest selection",
  );
  await expect(page.getByLabel("Guide content")).toHaveValue(
    /Latest selection/,
  );
  await commitImport(page);
  await expect(
    page.getByRole("heading", { name: "Latest selection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Slow stale file/ }),
  ).toHaveCount(0);
});
test("pending import cannot be interrupted into a different draft", async ({
  page,
}) => {
  await page.goto("./");
  await importDraft(page, "Pending import");
  await slowCommit(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Pending import", exact: true }),
  ).toBeVisible();
  await importDraft(page, "Next intact draft");
  await expect(page.getByLabel("Guide content")).toHaveValue(
    /Next intact draft/,
  );
});
test("pending screenshot blocks save; delayed review save locks mutable fields", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob: Blob) {
      setTimeout(() => read.call(this, blob), 700);
    };
  });
  await page.getByRole("button", { name: "Correct step", exact: true }).click();
  const existingImages = await page.locator(".image-editor img").count();
  await page
    .getByLabel("Version note", { exact: true })
    .fill("Synthetic screenshot correction");
  await page.getByLabel("Attach screenshot").setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByRole("button", { name: "Save corrected version", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".image-editor img")).toHaveCount(
    existingImages + 1,
  );
  await page
    .getByRole("button", { name: "Save corrected version", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".diff-panel.after img")).toHaveCount(
    existingImages + 1,
  );
  await page.getByLabel("Reviewer", { exact: true }).fill("Synthetic reviewer");
  await page
    .getByLabel("Environment / evidence source")
    .fill("Synthetic test environment");
  await page
    .getByLabel("What did you test and observe?")
    .fill("Submitted evidence A");
  await slowCommit(page);
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByLabel("What did you test and observe?"),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Review saved" }),
  ).toBeVisible();
  await page
    .getByLabel("What did you test and observe?")
    .fill("Next intact evidence B");
  await expect(page.getByLabel("What did you test and observe?")).toHaveValue(
    "Next intact evidence B",
  );
});
test("cross-tab conflict recovers without discarding import or review evidence", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await importDraft(page, "Preserved import draft");
  const other = await context.newPage();
  await other.goto(page.url());
  await importDraft(other, "Other tab commit");
  await commitImport(other);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh and keep draft", exact: true })
    .click();
  await expect(page.getByLabel("Guide content")).toHaveValue(
    /Preserved import draft/,
  );
  await page.getByRole("button", { name: "Check import", exact: true }).click();
  await commitImport(page);
  await page.getByLabel("Reviewer", { exact: true }).fill("Preserved reviewer");
  await page
    .getByLabel("Environment / evidence source")
    .fill("Synthetic environment");
  await page
    .getByLabel("What did you test and observe?")
    .fill("Preserved evidence");
  await other.reload();
  await other.getByRole("button", { name: /Preserved import draft/ }).click();
  await other
    .getByRole("button", { name: "Correct step", exact: true })
    .click();
  await other
    .getByLabel("Instructions", { exact: true })
    .fill("Changed settings action.");
  await other
    .getByLabel("Version note", { exact: true })
    .fill("Synthetic new version");
  await other
    .getByRole("button", { name: "Save corrected version", exact: true })
    .click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh and keep draft", exact: true })
    .click();
  await expect(page.getByLabel("What did you test and observe?")).toHaveValue(
    "Preserved evidence",
  );
  await expect(
    page.getByRole("button", { name: "Save review", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("I have retested the current version.").check();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Review saved" }),
  ).toBeVisible();
});
test("supported 20,000-entry history stays bounded while full backup preserves every record", async ({
  page,
}) => {
  test.setTimeout(60000);
  const workspace: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(workspace, fixture("Large synthetic history"));
  const g = workspace.guides[0],
    v = g.versions[0];
  g.reviews = Array.from({ length: 20000 }, (_, i) => ({
    id: `review_${i}`,
    versionId: v.id,
    stepId: "settings",
    status: "tested",
    reviewer: "Synthetic QA",
    context: "Synthetic history load",
    note: `Evidence entry ${i}`,
    createdAt: "2026-09-30T12:00:00.000Z",
  }));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  await page.getByLabel("GuideCheck workspace backup").setInputFiles({
    name: "synthetic-history.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(workspaceBackup(workspace))),
  });
  await page.getByLabel("I have saved a current backup").check();
  await page
    .getByRole("button", { name: "Restore workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const started = Date.now();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".review-records article")).toHaveCount(25);
  expect(Date.now() - started).toBeLessThan(3000);
  await expect(page.locator(".review-records")).toContainText(
    "Evidence entry 19999",
  );
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".review-records")).toContainText(
    "Evidence entry 19974",
  );
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download complete backup", exact: true })
    .click();
  const file = await downloading,
    stream = await file.createReadStream();
  if (!stream) throw new Error("Synthetic backup missing");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(
    parseWorkspaceBackup(Buffer.concat(chunks).toString("utf8")).guides[0]
      .reviews,
  ).toEqual(g.reviews);
});

test("a delayed refresh cannot replace a newer committed review", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Filter steps").selectOption("all");
  await page
    .getByLabel("Reviewer", { exact: true })
    .fill("Monotonic snapshot QA");
  await page
    .getByLabel("Environment / evidence source")
    .fill("Synthetic delayed read");
  await page
    .getByLabel("What did you test and observe?")
    .fill("New committed evidence survives an old read.");
  await page.evaluate(() => {
    let next = true;
    const d = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      "oncomplete",
    )!;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      configurable: true,
      get: d.get,
      set(callback: (this: IDBTransaction, e: Event) => void) {
        const delay = next ? 1000 : 0;
        next = false;
        d.set!.call(this, function (this: IDBTransaction, e: Event) {
          setTimeout(() => callback.call(this, e), delay);
        });
      },
    });
  });
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByText("Tested by Monotonic snapshot QA", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(
    page.getByText("Tested by Monotonic snapshot QA", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Filter steps").selectOption("all");
  await expect(
    page.getByText("Tested by Monotonic snapshot QA", { exact: true }),
  ).toBeVisible();
});

test("history page clamps after a shorter compatible cross-tab restore; browser Back/Forward preserves data", async ({
  page,
  context,
}) => {
  const state: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(state, fixture("History clamp fixture"));
  const original = structuredClone(state);
  for (let i = 2; i <= 12; i++) {
    const input = fixture("History clamp fixture");
    input.steps[0].text = `Synthetic version ${i}`;
    appendVersion(
      state,
      state.guides[0].id,
      input,
      `Synthetic revision ${i}`,
      state.guides[0].versions.at(-1)!.id,
    );
  }
  async function restore(target: Page, source: Workspace) {
    await target
      .getByRole("button", { name: "Backup & restore", exact: true })
      .click();
    await target.getByLabel("GuideCheck workspace backup").setInputFiles({
      name: "synthetic.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(workspaceBackup(source))),
    });
    await target.getByLabel("I have saved a current backup").check();
    await target
      .getByRole("button", { name: "Restore workspace", exact: true })
      .click();
    await expect(target.getByRole("dialog")).toHaveCount(0);
  }
  await page.goto("./");
  await restore(page, state);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".version-record")).toHaveCount(2);
  const other = await context.newPage();
  await other.goto(page.url());
  await restore(other, original);
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await expect(page.locator(".version-record")).toHaveCount(1);
  await expect(page.locator(".version-record h3")).toHaveText("Version 1");
  const initial = page.url();
  await page.goto(initial + "?qa-navigation=synthetic");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "History clamp fixture", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "History clamp fixture", exact: true }),
  ).toBeVisible();
});
