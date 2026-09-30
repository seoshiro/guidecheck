import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { Store, ConflictError } from "../server/store.ts";
import { apiServer } from "../server/app.ts";
import { counts, type GuideInput, type Workspace } from "../src/core.ts";
import { parseWorkspaceBackup } from "../src/workspace.ts";
const input: GuideInput = {
  title: "Test guide",
  owner: "Support",
  description: "Fixture context",
  steps: [
    {
      id: "open",
      title: "Open",
      text: "Choose Settings.",
      links: [],
      screenshots: [],
    },
    {
      id: "confirm",
      title: "Confirm",
      text: "Check access.",
      links: [],
      screenshots: [],
    },
  ],
};
test("versioning keeps history, carries unchanged evidence honestly and rejects stale/identical writes", () => {
  const store = new Store(":memory:", false);
  let s = store.create(input, 0);
  const id = s.guides[0].id;
  const first = s.guides[0].versions[0];
  const review = {
    versionId: first.id,
    stepId: "open",
    status: "tested",
    reviewer: "Tester",
    note: "Opened settings and observed expected navigation.",
    context: "Synthetic staging",
  };
  s = store.review(id, review, s.revision);
  const timestamp = s.guides[0].reviews[0].createdAt;
  assert.throws(() => store.review(id, review, 0), ConflictError);
  assert.throws(() =>
    store.review(id, { ...review, status: ["tested"] }, s.revision),
  );
  assert.throws(() =>
    store.append(id, input, "No change", s.revision, first.id),
  );
  const changed = {
    ...input,
    steps: [input.steps[0], { ...input.steps[1], text: "Check permissions." }],
  };
  s = store.append(id, changed, "Changed confirmation", s.revision, first.id);
  const g = s.guides[0];
  assert.equal(g.versions.length, 2);
  assert.equal(g.versions[0].steps[1].text, "Check access.");
  assert.equal(g.reviews.at(-1)!.createdAt, timestamp);
  assert.equal(g.reviews.at(-1)!.inheritedFrom, first.id);
  assert.deepEqual(counts(g), {
    tested: 1,
    needs_update: 0,
    unreviewed: 1,
    total: 2,
  });
  assert.throws(() => store.review(id, review, s.revision), ConflictError);
  assert.throws(() =>
    store.review(
      id,
      { ...review, versionId: g.versions[1].id, note: "" },
      s.revision,
    ),
  );
  s = store.append(
    id,
    { ...changed, description: "Different context" },
    "Context changed",
    s.revision,
    g.versions[1].id,
  );
  assert.equal(counts(s.guides[0]).tested, 0);
  store.close();
});
test("SQLite survives close/reopen without reseeding or losing evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "guidecheck-test-"));
  const file = join(dir, "store.sqlite");
  try {
    let store = new Store(file, false);
    let s = store.create(input, 0);
    s = store.review(
      s.guides[0].id,
      {
        versionId: s.guides[0].versions[0].id,
        stepId: "open",
        status: "needs_update",
        reviewer: "Tester",
        note: "Navigation moved.",
        context: "Synthetic test",
      },
      s.revision,
    );
    store.close();
    store = new Store(file, true);
    assert.deepEqual(store.read(), s);
    store.close();
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), "guidecheck-test-")));
    rmSync(dir, { recursive: true, force: true });
  }
});
test("HTTP import, review and exports round-trip; malformed and cross-origin requests do not mutate", async () => {
  const store = new Store(":memory:", false);
  const probe = apiServer(store, 4391);
  await new Promise<void>((resolve) =>
    probe.listen(4391, "127.0.0.1", resolve),
  );
  const url = "http://127.0.0.1:4391";
  const post = (path: string, b: unknown, origin?: string) =>
    fetch(url + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(b),
    });
  try {
    let r = await post("/api/guides", {
      source: JSON.stringify(input),
      format: "json",
      expectedRevision: 0,
    });
    assert.equal(r.status, 201);
    let s = (await r.json()) as Workspace;
    const g = s.guides[0];
    r = await post(`/api/guides/${g.id}/reviews`, {
      versionId: g.versions[0].id,
      stepId: "open",
      status: "tested",
      reviewer: "Tester",
      note: "Observed expected settings.",
      context: "Fixture",
      expectedRevision: s.revision,
    });
    assert.equal(r.status, 200);
    s = (await r.json()) as Workspace;
    const exported = await fetch(
      `${url}/api/guides/${g.id}/export?format=json`,
    ).then((r) => r.json());
    assert.deepEqual(exported, input);
    const md = await fetch(
      `${url}/api/guides/${g.id}/export?format=markdown`,
    ).then((r) => r.text());
    assert.match(md, /<!-- step:open -->/);
    const report = await fetch(
      `${url}/api/guides/${g.id}/export?format=report`,
    ).then((r) => r.json());
    assert.equal(report.guide.reviews[0].reviewer, "Tester");
    assert.match(report.notice, /human assertion/);
    const backup = await fetch(`${url}/api/workspace/export`).then((r) =>
      r.text(),
    );
    assert.deepEqual(parseWorkspaceBackup(backup), s);
    const invalidRestore = await post("/api/workspace/restore", {
      source: "{broken",
      expectedRevision: s.revision,
    });
    assert.equal(invalidRestore.status, 400);
    assert.deepEqual(store.read(), s);
    const restored = await post("/api/workspace/restore", {
      source: backup,
      expectedRevision: s.revision,
    });
    assert.equal(restored.status, 200);
    const afterRestore = (await restored.json()) as Workspace;
    assert.deepEqual(afterRestore.guides, s.guides);
    assert.equal(afterRestore.revision, s.revision + 1);
    s = afterRestore;
    assert.equal(
      (
        await post("/api/guides", {
          source: "{broken",
          format: "json",
          expectedRevision: s.revision,
        })
      ).status,
      400,
    );
    const invalidPath = await new Promise<number>((resolve) => {
      const r = httpRequest(
        {
          host: "127.0.0.1",
          port: 4391,
          path: "http://[",
          headers: { Host: "127.0.0.1:4391" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      r.end();
    });
    assert.equal(invalidPath, 400);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal(
      (
        await post(
          "/api/guides",
          {
            source: JSON.stringify(input),
            format: "json",
            expectedRevision: s.revision,
          },
          "https://example.com",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post("/api/guides", {
          source: JSON.stringify(input),
          format: "json",
          expectedRevision: 0,
        })
      ).status,
      409,
    );
    assert.deepEqual(store.read(), s);
    assert.equal((await fetch(`${url}/api/guides/missing/export`)).status, 404);
  } finally {
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    store.close();
  }
});
