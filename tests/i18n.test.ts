import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { messages } from "../src/locales.ts";
import {
  count,
  errorText,
  setLanguage,
  translate,
  type Language,
} from "../src/i18n.ts";
import { parseImport } from "../src/core.ts";

const locales: Language[] = ["en", "ru", "kk"];
const placeholders = (value: string) =>
  [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

function sourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(entry.name, directory);
    return entry.isDirectory()
      ? sourceFiles(new URL(`${entry.name}/`, directory))
      : /\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}

test("every static interface translation key has complete RU and KK copy", () => {
  const keys = new Set<string>();
  for (const directory of ["../src/", "../server/"]) {
    for (const path of sourceFiles(new URL(directory, import.meta.url))) {
      const file = readFileSync(path, "utf8");
      const tree = ts.createSourceFile(
        path.pathname,
        file,
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ["t", "setError", "setNotice", "setInfo"].includes(
            node.expression.text,
          ) &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          node.arguments[0].text.trim()
        ) {
          keys.add(node.arguments[0].text);
        }
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ["InputError", "ConflictError"].includes(node.expression.text) &&
          node.arguments?.[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          keys.add(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  assert.ok(keys.size > 100, "the source inventory must cover the interface");
  const missing = [...keys].filter((key) => !messages[key]);
  assert.deepEqual(
    missing,
    [],
    "static interface/error keys cannot fall back to English",
  );
});

test("catalog has no empty entries, duplicate keys, damaged Unicode, or altered placeholders", () => {
  const source = readFileSync(
    new URL("../src/locales.ts", import.meta.url),
    "utf8",
  );
  const tree = ts.createSourceFile(
    "locales.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const seen = new Set<string>();
  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))
    ) {
      const key = node.name.text;
      assert.ok(!seen.has(key), `duplicate catalog key: ${key}`);
      seen.add(key);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(Object.keys(messages).length > 300);
  for (const [key, pair] of Object.entries(messages)) {
    assert.equal(pair.length, 2, key);
    for (const value of pair) {
      assert.ok(value.trim(), `empty translation: ${key}`);
      assert.ok(!value.includes("\uFFFD"), `damaged Unicode: ${key}`);
      assert.deepEqual(placeholders(value), placeholders(key), key);
    }
  }
});

test("counted nouns use English, Russian, and Kazakh forms for 0/1/2/5/11/21", () => {
  assert.equal(count("steps", 1, "en"), "1 step");
  assert.equal(count("steps", 2, "en"), "2 steps");
  const russian: Record<string, string[]> = {
    steps: ["шаг", "шага", "шагов"],
    versions: ["версия", "версии", "версий"],
    guides: ["руководство", "руководства", "руководств"],
    reviews: ["запись проверки", "записи проверки", "записей проверки"],
    "changed steps": ["изменённый шаг", "изменённых шага", "изменённых шагов"],
    screenshots: ["снимок экрана", "снимка экрана", "снимков экрана"],
  };
  const kazakh: Record<string, string> = {
    steps: "қадам",
    versions: "нұсқа",
    guides: "нұсқаулық",
    reviews: "тексеру жазбасы",
    "changed steps": "өзгерген қадам",
    screenshots: "экран суреті",
  };
  type Noun = Parameters<typeof count>[0];
  for (const noun of Object.keys(russian) as Noun[]) {
    for (const value of [0, 1, 2, 5, 11, 21]) {
      const form = value === 1 || value === 21 ? 0 : value === 2 ? 1 : 2;
      assert.equal(count(noun, value, "ru"), `${value} ${russian[noun][form]}`);
      assert.equal(count(noun, value, "kk"), `${value} ${kazakh[noun]}`);
    }
  }
});

test("dynamic validation errors translate the field, count, and complete message", () => {
  const cases: [string, string, Record<string, string | number>][] = [
    [
      "Step 2 title must be non-empty text, up to 200 characters.",
      "{field} must be non-empty text, up to {max} characters.",
      { field: "Step {number} title", max: 200, number: 2 },
    ],
    [
      "Owner must be text, up to 100 characters.",
      "{field} must be text, up to {max} characters.",
      { field: "Owner", max: 100 },
    ],
    [
      "Guide must be an object.",
      "{field} must be an object.",
      { field: "Guide" },
    ],
    [
      "Guide title must be a single line without control characters.",
      "{field} must be a single line without control characters.",
      { field: "Guide title" },
    ],
    ["Guide ID is invalid.", "{field} is invalid.", { field: "Guide ID" }],
    [
      "Step 2 links must be HTTP(S) URLs without credentials, up to 20 links.",
      "Step {number} links must be HTTP(S) URLs without credentials, up to 20 links.",
      { number: 2 },
    ],
    [
      "Review reviewer is required, up to 100 characters.",
      "Review {field} is required, up to {max} characters.",
      { field: "Reviewer", max: 100 },
    ],
    [
      "Review note is required, up to 2000 characters.",
      "Review {field} is required, up to {max} characters.",
      { field: "Review note", max: 2000 },
    ],
    [
      "Review context is required, up to 500 characters.",
      "Review {field} is required, up to {max} characters.",
      { field: "Environment / evidence source", max: 500 },
    ],
    [
      "Request exceeds the 60 MB limit.",
      "Request exceeds the {max} MB limit.",
      { max: 60 },
    ],
  ];
  try {
    for (const locale of locales) {
      setLanguage(locale);
      for (const [error, key, params] of cases) {
        const field = params.field;
        const expected =
          locale === "en"
            ? error
            : translate(key, locale, {
                ...params,
                ...(typeof field === "string"
                  ? { field: translate(field, locale, params) }
                  : {}),
              });
        assert.equal(errorText(error), expected, `${locale}: ${error}`);
      }
    }
  } finally {
    setLanguage("en");
  }
});

test("import errors localize while authored content and interchange syntax stay exact", () => {
  const authored = {
    title: "Exact EN RU Русский KK Қазақ — <script>literal</script>",
    owner: "O'Connor / Әлия",
    description:
      "Do not translate: title owner description steps id text links screenshots name dataUrl.",
    steps: [
      {
        id: "stable-id",
        title: "Exact step — Қадам",
        text: "Keep <b>literal</b> & quotes.",
        links: ["https://example.com/a?x=1&y=2"],
        screenshots: [],
      },
    ],
  };
  const json = JSON.stringify(authored);
  try {
    for (const locale of locales) {
      setLanguage(locale);
      assert.deepEqual(parseImport(json, "json"), authored);
      for (const invalid of [
        "{broken",
        JSON.stringify({
          ...authored,
          steps: [
            {
              ...authored.steps[0],
              links: ["https://user:password@example.com"],
            },
          ],
        }),
      ]) {
        let error = "";
        try {
          parseImport(invalid, "json");
        } catch (caught) {
          error = (caught as Error).message;
        }
        assert.ok(error);
        const rendered = errorText(error);
        assert.ok(rendered.trim());
        assert.ok(!/\{\w+\}/.test(rendered));
        if (locale !== "en") assert.notEqual(rendered, error);
      }
    }
  } finally {
    setLanguage("en");
  }
  const help =
    "JSON uses title, owner, description, and steps with id, title, text, links, and optional screenshots: {name, dataUrl}. Up to 100 steps, 3 images per step, 500 KB per image, and 5 MB per import.";
  for (const locale of locales) {
    const rendered = translate(help, locale);
    for (const token of [
      "title",
      "owner",
      "description",
      "steps",
      "id",
      "text",
      "links",
      "screenshots",
      "{name, dataUrl}",
    ])
      assert.ok(rendered.includes(token), `${locale}: ${token}`);
  }
});
