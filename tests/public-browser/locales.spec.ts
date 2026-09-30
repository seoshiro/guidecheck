import { test, expect, type Page } from "@playwright/test";
import { translate, LANGUAGE_KEY, type Language } from "../../src/i18n.ts";

const locales: Language[] = ["en", "ru", "kk"];
const text = (key: string, locale: Language) => translate(key, locale);
const source = {
  title: "Exact user title — Русский Қазақ <b>literal</b>",
  owner: "Әлия / O'Connor",
  description:
    "Exact user context: English — Русский — Қазақ. <script>literal</script>",
  steps: [
    {
      id: "stable-id",
      title: "Exact user step — Шаг Қадам",
      text: "Keep Settings, Настройки, Баптаулар; <img src=x onerror=alert(1)> is literal text.",
      links: ["https://example.com/help?x=1&y=2"],
      screenshots: [],
    },
  ],
};

async function switchLanguage(page: Page, locale: Language, dialog = false) {
  const selector = page.locator(
    dialog
      ? "dialog .language-picker select"
      : ".topbar .language-picker select",
  );
  await selector.selectOption(locale);
  await expect(selector).toHaveValue(locale);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function openImport(page: Page, locale: Language) {
  await page
    .getByRole("button", { name: text("Import guide", locale), exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel(text("Format", locale), { exact: true })
    .selectOption("json");
}

async function importExactGuide(page: Page, locale: Language) {
  await openImport(page, locale);
  await page
    .getByLabel(text("Guide content", locale))
    .fill(JSON.stringify(source));
  await page
    .getByRole("button", { name: text("Check import", locale), exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: text("Import guide", locale), exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: source.title, exact: true }),
  ).toBeVisible();
}

test("EN/RU/KK selectors persist and set document language", async ({
  page,
}) => {
  await ready(page);
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(
      page.getByRole("button", {
        name: text("Import guide", locale),
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), LANGUAGE_KEY),
    ).toBe(locale);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator(".topbar .language-picker select")).toHaveValue(
      locale,
    );
    await expect(
      page.getByRole("button", {
        name: text("Backup & restore", locale),
        exact: true,
      }),
    ).toBeVisible();
  }
  // Native language names must render intact, irrespective of the active locale.
  expect(
    await page.locator('.topbar option[value="ru"]').textContent(),
  ).toMatch(/Русский|Орыс тілі/);
  expect(
    await page.locator('.topbar option[value="kk"]').textContent(),
  ).toMatch(/Қазақша|Қазақ тілі/);
});

test("switching an open import dialog preserves the draft and retranslates its error", async ({
  page,
}) => {
  await ready(page);
  await openImport(page, "en");
  const malformed = '{"title":"Exact draft — Қазақ Русский",broken';
  await page.getByLabel("Guide content").fill(malformed);
  await page.getByRole("button", { name: "Check import", exact: true }).click();
  for (const locale of locales) {
    await switchLanguage(page, locale, true);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel(text("Guide content", locale))).toHaveValue(
      malformed,
    );
    await expect(
      page.getByLabel(text("Format", locale), { exact: true }),
    ).toHaveValue("json");
    await expect(page.getByRole("alert")).toHaveText(
      text("Invalid JSON. Check commas, quotes, and brackets.", locale),
    );
    await expect(
      page.getByRole("dialog").getByRole("button", {
        name: text("Import guide", locale),
        exact: true,
      }),
    ).toBeDisabled();
  }
});

for (const locale of locales) {
  test(`${locale}: authored guide and review content stays exact across language changes`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await ready(page);
    await switchLanguage(page, locale);
    await importExactGuide(page, locale);
    const reviewer = "Exact reviewer — Әлия / Ivan";
    const environment = "Exact environment — Қазақ / Русский";
    const note =
      "Exact review <b>literal</b> — checked Settings, Настройки, Баптаулар.";
    await page
      .getByLabel(text("Reviewer", locale), { exact: true })
      .fill(reviewer);
    await page
      .getByLabel(text("Environment / evidence source", locale))
      .fill(environment);
    await page
      .getByLabel(text("What did you test and observe?", locale))
      .fill(note);
    await page
      .getByRole("button", { name: text("Save review", locale), exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      text("Review saved with your name, environment, and timestamp.", locale),
    );
    for (const next of locales) {
      await switchLanguage(page, next);
      await page.getByLabel(text("Filter steps", next)).selectOption("tested");
      await expect(page.locator("main h1")).toHaveText(source.title);
      await expect(page.locator(".page-heading > div > p")).toHaveText(
        source.description,
      );
      await expect(page.locator(".diff-panel.after h3")).toHaveText(
        source.steps[0].title,
      );
      await expect(
        page.locator(".diff-panel.after .instruction-text"),
      ).toHaveText(source.steps[0].text);
      await expect(
        page.locator(".diff-panel.after .references a"),
      ).toHaveAttribute("href", source.steps[0].links[0]);
      await expect(page.locator(".evidence p")).toHaveText(note);
      await expect(page.locator(".evidence strong")).toContainText(reviewer);
      await expect(page.locator(".evidence small")).toContainText(environment);
      await expect(
        page.locator(
          "main h1 b, .instruction-text img, .instruction-text script, .evidence b",
        ),
      ).toHaveCount(0);
    }
    expect(failures).toEqual([]);
  });

  test(`${locale}: malformed JSON and hostile URL are rejected with localized errors`, async ({
    page,
  }) => {
    const outgoing: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") outgoing.push(request.url());
    });
    await ready(page);
    await switchLanguage(page, locale);
    await openImport(page, locale);
    const field = page.getByLabel(text("Guide content", locale));
    await field.fill("{broken");
    await page
      .getByRole("button", { name: text("Check import", locale), exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      text("Invalid JSON. Check commas, quotes, and brackets.", locale),
    );
    for (const url of [
      "javascript:alert(1)",
      "https://user:password@example.com/help",
    ]) {
      const payload = JSON.stringify({
        ...source,
        steps: [{ ...source.steps[0], links: [url] }],
      });
      await field.fill(payload);
      await page
        .getByRole("button", {
          name: text("Check import", locale),
          exact: true,
        })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        translate(
          "Step {number} links must be HTTP(S) URLs without credentials, up to 20 links.",
          locale,
          { number: 1 },
        ),
      );
      await expect(
        page.getByRole("dialog").getByRole("button", {
          name: text("Import guide", locale),
          exact: true,
        }),
      ).toBeDisabled();
      await expect(field).toHaveValue(payload);
    }
    expect(outgoing).toEqual([]);
  });
}

async function inspectLayout(page: Page, dialog = false) {
  const result = await page.evaluate((inDialog) => {
    const root = document.documentElement;
    const scope = inDialog
      ? document.querySelector("dialog[open]")!
      : document.body;
    const outside: string[] = [];
    const clipped: string[] = [];
    const smallTargets: string[] = [];
    const regions =
      ".topbar,.page-heading,.metrics,.workbench-header,.comparison-toolbar,.guide-library,.step-items,.review-detail,.step-heading,.diff-grid,.diff-panel,.review-form,.review-actions,.step-pagination,.main-footer,.modal-head,.modal-actions,dialog[open],button,select,input:not([type=radio]):not([type=checkbox]),textarea,summary";
    for (const element of Array.from(
      scope.querySelectorAll<HTMLElement>(regions),
    )) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        !rect.width ||
        !rect.height
      )
        continue;
      // Mobile guide and step lists deliberately scroll inside their own bounds.
      const scrollingList = element.closest(".guide-library,.step-items");
      if (scrollingList && scrollingList !== element) continue;
      const label = `${element.tagName.toLowerCase()}.${element.className} ${(element.textContent ?? "").trim().slice(0, 65)}`;
      if (rect.left < -1 || rect.right > innerWidth + 1) outside.push(label);
      if (
        !element.matches("input,textarea,select,.guide-library,.step-items") &&
        element.scrollWidth > element.clientWidth + 2
      )
        clipped.push(label);
      if (
        innerWidth <= 768 &&
        element.matches("button,select,summary") &&
        (rect.height < 44 || rect.width < 44)
      )
        smallTargets.push(
          `${label} (${Math.round(rect.width)}×${Math.round(rect.height)})`,
        );
    }
    const modal = document.querySelector<HTMLDialogElement>("dialog[open]");
    const box = modal?.getBoundingClientRect();
    return {
      rootOverflow:
        root.scrollWidth > innerWidth + 1 ||
        document.body.scrollWidth > innerWidth + 1,
      outside,
      clipped,
      smallTargets,
      modalOutside: Boolean(
        box &&
        (box.left < 0 ||
          box.right > innerWidth ||
          box.top < 0 ||
          box.bottom > innerHeight),
      ),
      modalHorizontalScroll: Boolean(
        modal && modal.scrollWidth > modal.clientWidth + 2,
      ),
      fontLoaded: Array.from(document.fonts).some(
        (font) => font.status === "loaded",
      ),
      fontsReady: document.fonts.status === "loaded",
    };
  }, dialog);
  return result;
}

async function inspectKeyboardFocus(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body)
      return "No control received keyboard focus";
    const style = getComputedStyle(active);
    const box = active.getBoundingClientRect();
    const ring =
      (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) ||
      style.boxShadow !== "none";
    return active.matches(":focus-visible") &&
      ring &&
      box.width > 0 &&
      box.height > 0
      ? ""
      : `${active.tagName}: keyboard focus has no visible ring`;
  });
}

for (const locale of locales) {
  test(`${locale}: workspace and dialogs fit the viewport matrix with loaded fonts and touch controls`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await ready(page);
    await switchLanguage(page, locale);
    const matrix = [320, 360, 390, 414, 768, 1280, 1440].flatMap((width) => [
      { width, height: Math.max(960, Math.ceil(width * 1.25)) },
      { width, height: Math.min(420, width - 80) },
    ]);
    const defects: unknown[] = [];
    async function check(flow: string, dialog = false) {
      const result = await inspectLayout(page, dialog);
      if (
        result.rootOverflow ||
        result.outside.length ||
        result.clipped.length ||
        result.smallTargets.length ||
        result.modalOutside ||
        result.modalHorizontalScroll ||
        !result.fontLoaded ||
        !result.fontsReady
      )
        defects.push({ viewport: page.viewportSize(), flow, ...result });
    }
    for (const viewport of matrix) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await check("workspace");
        for (const action of [
          "Import guide",
          "Correct step",
          "Backup & restore",
        ]) {
          await page
            .getByRole("button", { name: text(action, locale), exact: true })
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await check(action, true);
          await page
            .getByRole("dialog")
            .locator(".language-picker select")
            .focus();
          await page.keyboard.press("Tab");
          const focus = await inspectKeyboardFocus(page);
          if (focus) defects.push({ viewport, flow: action, focus });
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }
      });
    }
    await testInfo.attach("locale-layout-matrix", {
      body: JSON.stringify({ locale, matrix, defects }, null, 2),
      contentType: "application/json",
    });
    expect(defects).toEqual([]);
  });
}
