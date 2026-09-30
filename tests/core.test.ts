import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compare,
  parseImport,
  safeUrl,
  toMarkdown,
  validateGuide,
  validateScreenshot,
  wordDiff,
  type GuideInput,
  type Step,
} from "../src/core.ts";
const step = (id: string, text = "Choose Settings."): Step => ({
  id,
  title: id,
  text,
  links: [],
  screenshots: [],
});
const input: GuideInput = {
  title: "Synthetic guide",
  owner: "Support",
  description: "A fixture",
  steps: [step("open"), step("confirm")],
};
test("diff identifies text, title, links, screenshot, order, additions and removals by stable ID", () => {
  const before = [step("open"), step("confirm"), step("removed")];
  const after = [
    {
      ...step("confirm", "New instructions"),
      title: "New title",
      links: ["https://example.com"],
      screenshots: [{ name: "changed", dataUrl: "different" }],
    },
    step("open"),
    step("added"),
  ];
  const d = compare(before, after);
  assert.deepEqual(d[0].reasons, [
    "Title",
    "Instructions",
    "Links",
    "Screenshots",
    "Order",
  ]);
  assert.deepEqual(
    d.map((c) => c.kind),
    ["changed", "changed", "added", "removed"],
  );
  assert.equal(compare([step("open")], [step("open")])[0].kind, "unchanged");
});
test("word diff reconstructs both texts and handles a large input with a bounded fallback", () => {
  for (const [a, b] of [
    ["", "added"],
    ["removed", ""],
    ["Settings Billing", "Settings Plans & billing"],
    ["same", "same"],
    ["one ".repeat(500), "two ".repeat(500)],
  ]) {
    const d = wordDiff(a, b);
    assert.equal(
      d
        .filter((x) => x.type !== "add")
        .map((x) => x.text)
        .join(""),
      a,
    );
    assert.equal(
      d
        .filter((x) => x.type !== "remove")
        .map((x) => x.text)
        .join(""),
      b,
    );
  }
});
test("Markdown retains explicit IDs through export/reorder and extracts safe references", () => {
  const g = parseImport(toMarkdown(input), "markdown");
  assert.deepEqual(g, input);
  const reordered = parseImport(
    "# Test\nOwner: Support\n\n## B\n<!-- step:b -->\n[Help](https://example.com/help)\n\n## A\n<!-- step:a -->\nChoose A.",
    "markdown",
  );
  assert.deepEqual(
    reordered.steps.map((s) => s.id),
    ["b", "a"],
  );
  assert.deepEqual(reordered.steps[0].links, ["https://example.com/help"]);
});
test("Markdown export preserves separate references and does not inject instructions on reimport", () => {
  for (const text of [
    "",
    "Open settings.",
    "Open https://example.com/help.",
    "[Help](https://example.com/help)",
  ]) {
    const g = {
      ...input,
      steps: [{ ...step("open", text), links: ["https://example.com/help"] }],
    };
    assert.deepEqual(parseImport(toMarkdown(g), "markdown"), g);
  }
  const g = {
    ...input,
    steps: [{ ...step("open"), links: ["https://example.com/help_(current)"] }],
  };
  assert.deepEqual(parseImport(toMarkdown(g), "markdown"), g);
  assert.deepEqual(
    parseImport(
      "# Test\n## Step\n[Help](https://example.com/help_(current))",
      "markdown",
    ).steps[0].links,
    ["https://example.com/help_(current)"],
  );
  const edited = toMarkdown(g).replace(
    "[Reference](https://example.com/help_(current))",
    "[Reference](https://example.com/new)",
  );
  assert.deepEqual(parseImport(edited, "markdown").steps[0].links, [
    "https://example.com/new",
  ]);
});
test("imports reject malformed data, duplicate IDs, unsafe links, remote images, and limits", () => {
  for (const source of ["", "{broken", "[]", '{"title":"No steps"}'])
    assert.throws(() => parseImport(source, "json"));
  assert.throws(() =>
    validateGuide({ ...input, steps: [step("same"), step("same")] }),
  );
  assert.throws(() =>
    validateGuide({
      ...input,
      steps: [{ ...step("a"), links: ["javascript:alert(1)"] }],
    }),
  );
  assert.throws(() =>
    validateGuide({
      ...input,
      steps: Array.from({ length: 101 }, (_, i) => step(`s${i}`)),
    }),
  );
  assert.throws(() =>
    parseImport(
      "# Guide\n## Step\n![Remote](https://example.com/image.png)",
      "markdown",
    ),
  );
  assert.throws(() => parseImport("# Guide\nNo steps", "markdown"));
  assert.throws(() =>
    validateScreenshot({
      name: "x",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    }),
  );
  assert.throws(() =>
    validateScreenshot({
      name: "x",
      dataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
    }),
  );
  assert.equal(safeUrl("file:///etc/passwd"), false);
  assert.equal(safeUrl("https://user:pass@example.com"), false);
  assert.equal(safeUrl("https://example.com/help"), true);
});
test("embedded screenshots round-trip with bracket and backslash descriptions", () => {
  const fixture = parseImport(
    readFileSync(
      new URL("../fixtures/invoice-v1.json", import.meta.url),
      "utf8",
    ),
    "json",
  );
  fixture.steps[0].screenshots[0].name = "Atlas [billing] \\ synthetic";
  assert.deepEqual(parseImport(toMarkdown(fixture), "markdown"), fixture);
});

test("guide import enforces the same UTF-8 byte limit for pasted Unicode and files", () => {
  const fixture = {
    title: "Synthetic Unicode size fixture",
    owner: "",
    description: "",
    steps: Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      title: "Synthetic step",
      text: "Қ".repeat(20000),
    })),
    padding: "a".repeat(1100000),
  };
  const source = JSON.stringify(fixture);
  assert.ok(source.length < 5_000_000);
  assert.ok(new TextEncoder().encode(source).length > 5_000_000);
  assert.throws(() => parseImport(source, "json"), /smaller than 5 MB/);
  fixture.padding = "a".repeat(500000);
  const accepted = parseImport(JSON.stringify(fixture), "json");
  assert.equal(accepted.steps.length, 100);
  assert.equal(accepted.steps[99].text, fixture.steps[99].text);
  assert.equal(accepted.title, fixture.title);
});
