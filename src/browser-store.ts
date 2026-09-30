import { InputError, parseImport, toMarkdown, type Workspace } from "./core.ts";
import {
  addGuide,
  addReview,
  appendVersion,
  ConflictError,
  guideReport,
  parseWorkspaceBackup,
  validateWorkspace,
  serializeWorkspaceBackup,
} from "./workspace.ts";
import first from "../fixtures/invoice-v1.json";
import second from "../fixtures/invoice-v2.json";
export const browserMode = import.meta.env.VITE_STORAGE === "browser";
export const basePath = import.meta.env.BASE_URL;
const dbName = "guidecheck-private-workspace-v1";
let dbPromise: Promise<IDBDatabase> | undefined;
const storageError = (e: unknown) =>
  e instanceof DOMException && e.name === "QuotaExceededError"
    ? "Browser storage is full. Export a backup, free device space, and try again. Existing data was not changed."
    : "Browser storage is unavailable or blocked. Use a regular browser profile with site storage enabled, or run the local SQLite version. No temporary workspace was substituted.";
function open(): Promise<IDBDatabase> {
  if (!dbPromise)
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error(storageError(undefined)));
        return;
      }
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("workspace");
      r.onerror = () => reject(new Error(storageError(r.error)));
      r.onblocked = () =>
        reject(
          new Error(
            "Another GuideCheck tab is blocking storage startup. Close older tabs and reload.",
          ),
        );
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          dbPromise = undefined;
        };
        resolve(r.result);
      };
    }).catch((e) => {
      dbPromise = undefined;
      throw e;
    });
  return dbPromise!;
}
function seed(): Workspace {
  const state: Workspace = { schemaVersion: 1, revision: 0, guides: [] };
  if (import.meta.env.VITE_GUIDECHECK_EMPTY === "1") return state;
  addGuide(state, first, true);
  const g = state.guides[0];
  const v = g.versions[0];
  for (const step of v.steps)
    addReview(state, g.id, {
      versionId: v.id,
      stepId: step.id,
      status: "tested",
      reviewer: "Demo reviewer",
      note: "Synthetic example: followed this step in the fictional Atlas sandbox.",
      context: "Sample evidence - Atlas sandbox",
    });
  appendVersion(
    state,
    g.id,
    second,
    "Sample update: new billing navigation and export options",
    v.id,
  );
  addGuide(
    state,
    {
      title: "Invite a teammate",
      owner: "People operations",
      description: "A short onboarding checklist. Original synthetic example.",
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
    true,
  );
  return state;
}
async function transaction(
  expected: number | undefined,
  action?: (s: Workspace) => void,
): Promise<Workspace> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    const bucket = tx.objectStore("workspace");
    const read = bucket.get("current");
    let result: Workspace;
    let error: unknown;
    read.onsuccess = () => {
      try {
        result = read.result ? validateWorkspace(read.result) : seed();
        if (expected !== undefined && result.revision !== expected)
          throw new ConflictError(
            "The workspace changed in another tab. Refresh and try again.",
          );
        if (action) {
          action(result);
          result.revision++;
          validateWorkspace(result);
          serializeWorkspaceBackup(result);
        }
        if (!read.result || action) bucket.put(result, "current");
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      if (action && globalThis.BroadcastChannel) {
        const channel = new BroadcastChannel("guidecheck-changes");
        channel.postMessage(result.revision);
        channel.close();
      }
      resolve(result);
    };
    tx.onerror = () => reject(error ?? new Error(storageError(tx.error)));
    tx.onabort = () => reject(error ?? new Error(storageError(tx.error)));
  });
}
export async function browserRequest(
  path: string,
  value?: unknown,
): Promise<Workspace> {
  if (path === "/api/workspace" && !value) return transaction(undefined);
  const b = value as Record<string, unknown>;
  if (
    !b ||
    !Number.isSafeInteger(b.expectedRevision) ||
    Number(b.expectedRevision) < 0
  )
    throw new InputError("A valid workspace revision is required.");
  const expected = Number(b.expectedRevision);
  if (path === "/api/workspace/restore") {
    if (typeof b.source !== "string")
      throw new InputError("Choose a workspace backup.");
    const restored = parseWorkspaceBackup(b.source);
    return transaction(expected, (s) => {
      s.guides = restored.guides;
    });
  }
  if (path === "/api/guides") {
    if (
      typeof b.source !== "string" ||
      (b.format !== "json" && b.format !== "markdown")
    )
      throw new InputError(
        "Choose JSON or Markdown and include guide content.",
      );
    const input = parseImport(b.source, b.format);
    return transaction(expected, (s) => addGuide(s, input));
  }
  const match = /^\/api\/guides\/([\w-]+)\/(versions|reviews)$/.exec(path);
  if (!match) throw new InputError("Unknown workspace action.");
  return transaction(expected, (s) => {
    if (match[2] === "reviews") return addReview(s, match[1], b);
    if (
      typeof b.source !== "string" ||
      (b.format !== "json" && b.format !== "markdown") ||
      typeof b.note !== "string" ||
      typeof b.baseVersionId !== "string"
    )
      throw new InputError(
        "Version content, format, note, and base version are required.",
      );
    appendVersion(
      s,
      match[1],
      parseImport(b.source, b.format),
      b.note,
      b.baseVersionId,
    );
  });
}
export function download(
  content: string,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportBrowserGuide(
  workspace: Workspace,
  guideId: string,
  versionId: string,
  format: "markdown" | "json" | "report",
) {
  const g = workspace.guides.find((g) => g.id === guideId)!;
  const v = g.versions.find((v) => v.id === versionId)!;
  const content =
    format === "markdown"
      ? toMarkdown(v)
      : JSON.stringify(
          format === "report"
            ? guideReport(g)
            : {
                title: v.title,
                owner: v.owner,
                description: v.description,
                steps: v.steps,
              },
          null,
          2,
        );
  download(
    content,
    `guidecheck-${guideId.slice(0, 8)}-v${v.number}${format === "report" ? "-verification" : ""}.${format === "markdown" ? "md" : "json"}`,
    format === "markdown" ? "text/markdown" : "application/json",
  );
}
export function downloadBrowserBackup(s: Workspace) {
  download(
    serializeWorkspaceBackup(s),
    `guidecheck-workspace-${new Date().toISOString().slice(0, 10)}.json`,
  );
}
