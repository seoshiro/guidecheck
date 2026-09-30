import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "guidecheck-production-"));
const port = 4393;
const url = `http://127.0.0.1:${port}`;
let child;
async function start() {
  child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts", "--production"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        GUIDECHECK_DB: join(dir, "db.sqlite"),
        GUIDECHECK_EMPTY: "1",
      },
      stdio: "pipe",
      windowsHide: true,
    },
  );
  const processOutput = [];
  child.stderr.on("data", (d) => processOutput.push(d.toString()));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Production startup timed out: ${processOutput.join("")}`),
        ),
      10000,
    );
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Production exited ${code}: ${processOutput.join("")}`));
    });
    child.stdout.on("data", (d) => {
      if (d.toString().includes("GuideCheck running")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  await new Promise((resolve) => {
    current.once("exit", resolve);
    current.kill();
  });
}
try {
  await start();
  const html = await fetch(url + "/");
  assert.equal(html.status, 200);
  assert.match(
    html.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await html.text(), /GuideCheck/);
  const invalid = await fetch(url + "/%E0%A4%A");
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(url + "/api/health")).status, 200);
  const input = {
    title: "Restart evidence fixture",
    owner: "Synthetic QA",
    description: "Process restart test",
    steps: [
      {
        id: "check",
        title: "Check persistence",
        text: "Observe stored review after restart.",
        links: [],
        screenshots: [],
      },
    ],
  };
  let r = await fetch(url + "/api/guides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: JSON.stringify(input),
      format: "json",
      expectedRevision: 0,
    }),
  });
  assert.equal(r.status, 201);
  let state = await r.json();
  const g = state.guides[0];
  r = await fetch(`${url}/api/guides/${g.id}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedRevision: state.revision,
      versionId: g.versions[0].id,
      stepId: "check",
      status: "tested",
      reviewer: "Production verifier",
      context: "Original synthetic fixture",
      note: "Stored record for the restart test.",
    }),
  });
  assert.equal(r.status, 200);
  state = await r.json();
  await stop();
  await start();
  const after = await fetch(url + "/api/workspace").then((r) => r.json());
  assert.deepEqual(after, state);
  const report = await fetch(
    `${url}/api/guides/${g.id}/export?format=report`,
  ).then((r) => r.json());
  assert.deepEqual(report.guide, state.guides[0]);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(
    "evidence/production-restart.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        productionHtml: true,
        cspPresent: true,
        malformedPathReturns400: true,
        serverRestartPreservesWorkspace: true,
        reportAfterRestartPreservesEvidence: true,
        isolatedTemporaryDatabase: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Production HTML/CSP, malformed path, actual process restart, SQLite evidence persistence, and report export passed.",
  );
} finally {
  await stop();
  assert.ok(dir.startsWith(join(tmpdir(), "guidecheck-production-")));
  rmSync(dir, { recursive: true, force: true });
}
