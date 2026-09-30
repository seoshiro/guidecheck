import { test, expect, type Page } from "@playwright/test";
import {
  addGuide,
  parseWorkspaceBackup,
  workspaceBackup,
} from "../../src/workspace.ts";
import { type Workspace } from "../../src/core.ts";

function fixture(title: string) {
  return {
    title,
    owner: "Synthetic backup QA",
    description: "An isolated backup safety fixture.",
    steps: [
      {
        id: "check",
        title: "Check settings",
        text: "Observe Settings.",
        links: [],
        screenshots: [],
      },
    ],
  };
}

async function importGuide(page: Page, title: string) {
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  await page.getByLabel("Guide content").fill(JSON.stringify(fixture(title)));
  await page.getByRole("button", { name: "Check import", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

async function snapshot(page: Page): Promise<Workspace> {
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const request = indexedDB.open("guidecheck-private-workspace-v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("workspace", "readonly");
          const read = transaction.objectStore("workspace").get("current");
          read.onsuccess = () => resolve(read.result as Workspace);
          read.onerror = () => reject(read.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );
}

async function delayCompletion(page: Page) {
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      "oncomplete",
    )!;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      configurable: true,
      get: descriptor.get,
      set(callback: (this: IDBTransaction, event: Event) => void) {
        descriptor.set!.call(
          this,
          function (this: IDBTransaction, event: Event) {
            setTimeout(() => callback.call(this, event), 700);
          },
        );
      },
    });
  });
}

test("complete backup reads the latest cross-tab snapshot and locks pending download controls", async ({
  page,
  context,
}) => {
  await page.goto("./");
  const other = await context.newPage();
  await other.goto(page.url());
  await importGuide(other, "Committed in the other tab");
  const current = await snapshot(other);
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  await delayCompletion(page);
  let downloads = 0;
  page.on("download", () => downloads++);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download complete backup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparing backup...", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("GuideCheck workspace backup")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  const file = await pending;
  const stream = await file.createReadStream();
  if (!stream)
    throw new Error("The synthetic backup download was unavailable.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = parseWorkspaceBackup(Buffer.concat(chunks).toString("utf8"));
  expect(backup).toEqual(current);
  expect(downloads).toBe(1);
  await expect(
    page.getByRole("button", { name: "Download complete backup", exact: true }),
  ).toBeEnabled();
});

test("restore conflict refresh preserves the selected backup and requires confirmation again", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  const restored: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(restored, fixture("Selected restore fixture"));
  const field = page.getByLabel("GuideCheck workspace backup");
  await field.setInputFiles({
    name: "selected-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(workspaceBackup(restored))),
  });
  await expect(page.locator(".import-preview")).toContainText(/1 guide\b/);
  await page.getByLabel("I have saved a current backup").check();
  const other = await context.newPage();
  await other.goto(page.url());
  await importGuide(other, "Change after restore confirmation");
  const currentRevision = (await snapshot(other)).revision;
  await page
    .getByRole("button", { name: "Restore workspace", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "workspace changed in another tab",
  );
  await expect(page.locator(".import-preview")).toContainText(/1 guide\b/);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your selected backup is unchanged",
  );
  await expect(
    page.getByLabel("I have saved a current backup"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Restore workspace", exact: true }),
  ).toBeDisabled();
  expect(
    await field.evaluate((input) => (input as HTMLInputElement).files![0].name),
  ).toBe("selected-backup.json");
  await page.getByLabel("I have saved a current backup").check();
  await delayCompletion(page);
  await page
    .getByRole("button", { name: "Restore workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restoring...", exact: true }),
  ).toBeDisabled();
  await expect(field).toBeDisabled();
  await expect(page.getByLabel("I have saved a current backup")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Selected restore fixture",
      exact: true,
    }),
  ).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.guides).toEqual(restored.guides);
  expect(saved.revision).toBe(currentRevision + 1);
});

test("backup read failures recover controls without reporting a successful download", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Backup & restore", exact: true })
    .click();
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    let fail = true;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      if (fail) {
        fail = false;
        throw new Error("Synthetic backup read failure");
      }
      return transaction.apply(this, args);
    };
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page
    .getByRole("button", { name: "Download complete backup", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic backup read failure",
  );
  await expect(
    page.getByRole("button", { name: "Download complete backup", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(
      "Backup download requested. Confirm it is saved before restoring.",
    ),
  ).toHaveCount(0);
  expect(downloads).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
