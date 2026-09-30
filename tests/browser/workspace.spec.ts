import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
test.describe.configure({ mode: "serial" });
test("empty state, import, compare, review, correction, screenshot, exports and reload", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Good instructions deserve a second look."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  await page.getByLabel("Guide content").fill("{bad");
  await page.getByRole("button", { name: "Check import" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid JSON");
  const first = readFileSync(resolve("fixtures/invoice-v1.json"), "utf8");
  await page.getByLabel("Guide content").fill(first);
  await page.getByRole("button", { name: "Check import" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Export a customer invoice",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import revision", exact: true })
    .click();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  await page
    .getByLabel("Guide content")
    .fill(readFileSync(resolve("fixtures/invoice-v2.json"), "utf8"));
  await page
    .getByLabel("Version note", { exact: true })
    .fill("Synthetic navigation update");
  await page.getByRole("button", { name: "Check import" }).click();
  await page.getByRole("button", { name: "Create version" }).click();
  await expect(page.getByLabel("Current version", { exact: true })).toHaveValue(
    /.+/,
  );
  await expect(page.locator(".change-count")).toContainText("2 changed steps");
  await expect(page.locator("ins")).toContainText(["Plans", "&", "billing"]);
  await page.getByLabel("Reviewer", { exact: true }).fill("Browser reviewer");
  await page
    .getByLabel("Environment / evidence source")
    .fill("Synthetic Atlas staging");
  await page
    .getByLabel("What did you test and observe?")
    .fill("Opened Plans & billing and observed the billing page.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByRole("status")).toContainText("Review saved");
  await page.getByLabel("Filter steps").selectOption("all");
  await page
    .getByRole("button", { name: /Open billing settings.*Tested/ })
    .click();
  await expect(page.getByText("Tested by Browser reviewer")).toBeVisible();
  await page.getByRole("button", { name: "Correct step" }).click();
  await page
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Open Workspace settings, then choose Plans & billing. Confirm the customer workspace.",
    );
  await page
    .getByLabel("Attach screenshot")
    .setInputFiles(resolve("fixtures/atlas-v2.png"));
  await page
    .getByLabel("Version note", { exact: true })
    .fill("Clarify navigation with synthetic screenshot");
  await page.getByRole("button", { name: "Save corrected version" }).click();
  await expect(page.getByLabel("Current version", { exact: true })).toHaveValue(
    /.+/,
  );
  await expect(page.getByRole("img", { name: "atlas-v2.png" })).toBeVisible();
  await expect(page.getByText("Tested by Browser reviewer")).toHaveCount(0);
  await page.getByRole("radio", { name: "Needs update", exact: true }).check();
  await page.getByLabel("Reviewer", { exact: true }).fill("Browser reviewer");
  await page
    .getByLabel("Environment / evidence source")
    .fill("Synthetic Atlas staging");
  await page
    .getByLabel("What needs to change?")
    .fill("Permission requirements still need confirmation.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(
    page.getByText("Needs update by Browser reviewer"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Needs update by Browser reviewer"),
  ).toBeVisible();
  await page.locator(".export-menu summary").click();
  const dlPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Guide · Markdown" }).click();
  const download = await dlPromise;
  expect(download.suggestedFilename()).toMatch(/v3.md$/);
  await download.saveAs("test-results/corrected-guide.md");
  const report = await page.request.get("/api/workspace").then((r) => r.json());
  expect(report.guides[0].versions).toHaveLength(3);
  expect(report.guides[0].reviews).toHaveLength(2);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Opened Plans & billing and observed the billing page."),
  ).toBeVisible();
  await expect(
    page.getByText("Permission requirements still need confirmation."),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
test("mobile layout, search empty state, historical read-only view and keyboard dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Export a customer invoice" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Search steps").fill("impossible-query");
  await expect(page.getByText("No matching steps")).toBeVisible();
  await page.getByRole("button", { name: "Show all steps" }).click();
  await page
    .getByLabel("Current version", { exact: true })
    .selectOption({ label: "Version 1" });
  await expect(
    page.getByText("Preserved versions are read-only.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save review" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Import guide", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Import guide", exact: true }),
  ).toBeFocused();
});
test("400px and 1440px views stay within viewport; screenshot and hostile import are safe", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Filter steps").selectOption("all");
  for (const width of [400, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > innerWidth + 1;
        })
        .slice(0, 12)
        .map((el) => ({ tag: el.tagName, class: el.className })),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  await page.getByLabel("Guide content").fill(
    JSON.stringify({
      title: "<script>window.hacked=1</script>",
      steps: [{ id: "x", title: "x", links: ["javascript:alert(1)"] }],
    }),
  );
  await page.getByRole("button", { name: "Check import" }).click();
  await expect(page.getByRole("alert")).toContainText("HTTP(S)");
  await expect(
    page.getByRole("button", { name: "Import guide", exact: true }).last(),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  });
});
test("file import checks unsupported extensions, Markdown IDs, and invalid screenshots", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import guide", exact: true }).click();
  await page.getByLabel("Or choose a file").setInputFiles({
    name: "unsupported.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("# Test\n## Step\nContent"),
  });
  await expect(page.getByRole("alert")).toContainText(".md");
  await page
    .getByLabel("Or choose a file")
    .setInputFiles(resolve("public/fixtures/example.md"));
  await page.getByRole("button", { name: "Check import" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import guide", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Invite a teammate", exact: true }),
  ).toBeVisible();
  const workspace = await page.request
    .get("/api/workspace")
    .then((r) => r.json());
  expect(
    workspace.guides.at(-1).versions[0].steps.map((s: { id: string }) => s.id),
  ).toEqual(["invite", "confirm"]);
  await page.getByRole("button", { name: "Correct step" }).click();
  await page.getByLabel("Attach screenshot").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-png"),
  });
  await expect(page.getByRole("alert")).toContainText("truncated");
  const dialog = page.getByRole("dialog");
  const rect = await dialog.boundingBox();
  await page.mouse.click(rect!.x + 2, rect!.y + 2);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
});
