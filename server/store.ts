import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  validateGuide,
  type Workspace,
  type GuideInput,
  type Version,
} from "../src/core.ts";
import {
  addGuide,
  appendVersion,
  addReview,
  makeVersion,
  ConflictError,
  validateWorkspace,
  serializeWorkspaceBackup,
} from "../src/workspace.ts";
export { ConflictError } from "../src/workspace.ts";
export class Store {
  db: DatabaseSync;
  constructor(path: string, seed = true) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const schema = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (schema.user_version > 1) {
      this.db.close();
      throw new Error(
        "Database was created by a newer GuideCheck. Use a compatible version.",
      );
    }
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, data TEXT NOT NULL); PRAGMA user_version=1;",
    );
    if (!this.db.prepare("SELECT id FROM workspace").get()) {
      const state: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
      this.db
        .prepare("INSERT INTO workspace VALUES (1,0,?)")
        .run(JSON.stringify(state));
      if (seed) this.seed();
    }
  }
  read(): Workspace {
    const row = this.db
      .prepare("SELECT data FROM workspace WHERE id=1")
      .get() as { data: string };
    const state = JSON.parse(row.data) as Workspace;
    if (state.schemaVersion !== 1)
      throw new Error("Unsupported database version.");
    return state;
  }
  mutate(expected: number, action: (state: Workspace) => void): Workspace {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.read();
      if (state.revision !== expected)
        throw new ConflictError(
          "The workspace changed in another tab. Reload and try again.",
        );
      action(state);
      state.revision++;
      validateWorkspace(state);
      serializeWorkspaceBackup(state);
      this.db
        .prepare("UPDATE workspace SET revision=?,data=? WHERE id=1")
        .run(state.revision, JSON.stringify(state));
      this.db.exec("COMMIT");
      return state;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  create(input: GuideInput, expected: number, sample = false) {
    return this.mutate(expected, (s) => addGuide(s, input, sample));
  }
  version(input: GuideInput, number: number, note: string): Version {
    return makeVersion(input, number, note);
  }
  append(
    id: string,
    input: GuideInput,
    note: string,
    expected: number,
    baseVersionId: string,
  ) {
    return this.mutate(expected, (s) =>
      appendVersion(s, id, input, note, baseVersionId),
    );
  }
  review(id: string, raw: Record<string, unknown>, expected: number) {
    return this.mutate(expected, (s) => addReview(s, id, raw));
  }
  restore(input: Workspace, expected: number) {
    const restored = validateWorkspace(input);
    return this.mutate(expected, (s) => {
      s.guides = restored.guides;
    });
  }
  seed() {
    const old = validateGuide(
      JSON.parse(
        readFileSync(
          new URL("../fixtures/invoice-v1.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    let s = this.create(old, 0, true);
    const g = s.guides[0];
    const v = g.versions[0];
    for (const step of v.steps)
      s = this.review(
        g.id,
        {
          versionId: v.id,
          stepId: step.id,
          status: "tested",
          reviewer: "Demo reviewer",
          note: "Synthetic example: followed this step in the fictional Atlas sandbox.",
          context: "Sample evidence - Atlas sandbox",
        },
        s.revision,
      );
    const updated = validateGuide(
      JSON.parse(
        readFileSync(
          new URL("../fixtures/invoice-v2.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    s = this.append(
      g.id,
      updated,
      "Sample update: new billing navigation and export options",
      s.revision,
      v.id,
    );
    this.create(
      {
        title: "Invite a teammate",
        owner: "People operations",
        description:
          "A short onboarding checklist. Original synthetic example.",
        steps: [
          {
            id: "invite",
            title: "Send an invitation",
            text: "Open Workspace settings > Members. Select Invite teammate, enter their email, and choose the Member role.",
            links: ["https://example.com/help/members"],
            screenshots: [],
          },
          {
            id: "confirm",
            title: "Confirm access",
            text: "Ask the teammate to sign in and confirm they can view the shared workspace.",
            links: [],
            screenshots: [],
          },
        ],
      },
      s.revision,
      true,
    );
  }
  close() {
    this.db.close();
  }
}
