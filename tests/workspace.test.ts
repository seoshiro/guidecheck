import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addGuide,
  addReview,
  appendVersion,
  workspaceBackup,
  parseWorkspaceBackup,
  validateWorkspace,
  serializeWorkspaceBackup,
} from "../src/workspace.ts";
import { type Workspace, type GuideInput, counts } from "../src/core.ts";
const input: GuideInput = {
  title: "Browser release fixture",
  owner: "Synthetic QA",
  description: "Test context",
  steps: [
    {
      id: "open",
      title: "Open settings",
      text: "Choose Settings.",
      links: [],
      screenshots: [],
    },
  ],
};
test("shared browser domain preserves evidence and backup identities through revision and restore", () => {
  const s: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(s, input);
  const g = s.guides[0],
    first = g.versions[0];
  addReview(s, g.id, {
    versionId: first.id,
    stepId: "open",
    status: "tested",
    reviewer: "Synthetic reviewer",
    context: "Fixture environment",
    note: "Observed expected Settings page.",
  });
  appendVersion(
    s,
    g.id,
    { ...input, title: "Renamed guide" },
    "Title change",
    first.id,
  );
  assert.equal(counts(g).tested, 1);
  assert.equal(g.reviews.at(-1)!.createdAt, g.reviews[0].createdAt);
  assert.equal(g.reviews.at(-1)!.inheritedFrom, first.id);
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspaceBackup(s))), s);
  appendVersion(
    s,
    g.id,
    {
      ...input,
      steps: [{ ...input.steps[0], text: "Choose Workspace settings." }],
    },
    "Navigation changed",
    g.versions[1].id,
  );
  assert.equal(counts(g).tested, 0);
});
test("restored carried evidence requires original evidence and continuous unchanged content", () => {
  const s: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(s, input);
  const g = s.guides[0];
  addReview(s, g.id, {
    versionId: g.versions[0].id,
    stepId: "open",
    status: "tested",
    reviewer: "QA",
    note: "Observed settings",
    context: "Synthetic sandbox",
  });
  appendVersion(
    s,
    g.id,
    { ...input, title: "Rename one" },
    "Rename",
    g.versions[0].id,
  );
  appendVersion(
    s,
    g.id,
    { ...input, title: "Rename two" },
    "Rename",
    g.versions[1].id,
  );
  assert.deepEqual(validateWorkspace(s), s);
  for (const field of ["reviewer", "note", "context"] as const) {
    const bad = structuredClone(s);
    bad.guides[0].reviews[0][field] = " ";
    assert.throws(() => validateWorkspace(bad), /invalid review text/);
  }
  const missing = structuredClone(s);
  missing.guides[0].reviews.shift();
  assert.throws(() => validateWorkspace(missing), /match an original review/);
  for (const kind of ["instructions", "context", "evidence"] as const) {
    const bad = structuredClone(s);
    if (kind === "instructions")
      bad.guides[0].versions[1].steps[0].text = "Choose Admin.";
    if (kind === "context")
      bad.guides[0].versions[1].description = "Different environment";
    if (kind === "evidence") bad.guides[0].reviews[1].note = "Altered claim";
    assert.throws(() => validateWorkspace(bad), /match an original review/);
  }
});
test("large backups use the same bounded serialization for storage and restoration", () => {
  const s: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(s, input);
  const g = s.guides[0];
  for (let i = 0; i < 20000; i++)
    g.reviews.push({
      id: `large-review-${i}`,
      versionId: g.versions[0].id,
      stepId: "open",
      status: "tested",
      reviewer: "Synthetic QA",
      note: "n".repeat(2000),
      context: "c".repeat(220),
      createdAt: "2026-09-30T00:00:00.000Z",
    });
  const source = serializeWorkspaceBackup(s);
  assert.ok(new TextEncoder().encode(source).length <= 50_000_000);
  assert.equal(parseWorkspaceBackup(source).guides[0].reviews.length, 20000);
  for (const r of g.reviews) r.context = "c".repeat(500);
  assert.throws(() => serializeWorkspaceBackup(s), /50 MB backup limit/);
});
test("backup validation rejects unsafe content, broken references, duplicate IDs, and wrong formats without altering source", () => {
  const s: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  addGuide(s, input);
  const baseline = JSON.stringify(s);
  const invalid = structuredClone(s);
  invalid.guides[0].versions[0].steps[0].links = ["javascript:alert(1)"];
  assert.throws(() => validateWorkspace(invalid));
  const duplicate = structuredClone(s);
  duplicate.guides.push(duplicate.guides[0]);
  assert.throws(() => validateWorkspace(duplicate));
  const references = structuredClone(s);
  references.guides[0].reviews.push({
    id: "review",
    versionId: "missing",
    stepId: "open",
    status: "tested",
    reviewer: "Tester",
    context: "Fixture",
    note: "Synthetic",
    createdAt: new Date().toISOString(),
  });
  assert.throws(() => validateWorkspace(references));
  for (const source of [
    "{broken",
    JSON.stringify(input),
    JSON.stringify({
      product: "GuideCheck",
      reportVersion: 1,
      guide: s.guides[0],
    }),
  ])
    assert.throws(() => parseWorkspaceBackup(source));
  assert.equal(JSON.stringify(s), baseline);
});
