import {
  compare,
  latestReview,
  validateGuide,
  InputError,
  type Workspace,
  type GuideInput,
  type Review,
  type Version,
} from "./core.ts";
export class ConflictError extends Error {}
export function makeVersion(
  input: GuideInput,
  number: number,
  note: string,
): Version {
  return {
    ...validateGuide(input),
    id: crypto.randomUUID(),
    number,
    createdAt: new Date().toISOString(),
    note,
  };
}
export function addGuide(state: Workspace, input: GuideInput, sample = false) {
  state.guides.push({
    id: crypto.randomUUID(),
    sample,
    versions: [makeVersion(input, 1, "Initial import")],
    reviews: [],
  });
}
export function appendVersion(
  state: Workspace,
  id: string,
  input: GuideInput,
  note: string,
  baseVersionId: string,
) {
  if (!note.trim() || note.length > 500)
    throw new InputError("Add a version note, up to 500 characters.");
  const g = state.guides.find((g) => g.id === id);
  if (!g) throw new InputError("Guide not found.");
  const old = g.versions.at(-1)!;
  if (old.id !== baseVersionId)
    throw new ConflictError(
      "A newer version exists. Refresh before importing.",
    );
  const v = makeVersion(input, old.number + 1, note.trim());
  if (JSON.stringify(validateGuide(old)) === JSON.stringify(validateGuide(v)))
    throw new InputError(
      "This import is identical to the current guide. No new version was created.",
    );
  for (const c of compare(old.steps, v.steps))
    if (c.kind === "unchanged" && old.description === v.description) {
      const r = latestReview(g, old, c.id);
      if (r)
        g.reviews.push({
          ...r,
          id: crypto.randomUUID(),
          versionId: v.id,
          inheritedFrom: r.inheritedFrom ?? old.id,
        });
    }
  g.versions.push(v);
}
export function addReview(
  state: Workspace,
  id: string,
  raw: Record<string, unknown>,
) {
  for (const [key, max] of [
    ["reviewer", 100],
    ["note", 2000],
    ["context", 500],
  ] as const)
    if (
      typeof raw[key] !== "string" ||
      !(raw[key] as string).trim() ||
      (raw[key] as string).length > max
    )
      throw new InputError(
        `Review ${key} is required, up to ${max} characters.`,
      );
  if (
    typeof raw.status !== "string" ||
    !["tested", "needs_update"].includes(raw.status)
  )
    throw new InputError("Choose Tested or Needs update.");
  const g = state.guides.find((g) => g.id === id);
  if (!g) throw new InputError("Guide not found.");
  const v = g.versions.at(-1)!;
  if (v.id !== raw.versionId)
    throw new ConflictError(
      "Only the current version can be reviewed. Refresh the guide.",
    );
  if (!v.steps.some((s) => s.id === raw.stepId))
    throw new InputError("Step not found in the current version.");
  g.reviews.push({
    id: crypto.randomUUID(),
    versionId: v.id,
    stepId: String(raw.stepId),
    status: raw.status as Review["status"],
    reviewer: String(raw.reviewer).trim(),
    note: String(raw.note).trim(),
    context: String(raw.context).trim(),
    createdAt: new Date().toISOString(),
  });
}
export function guideReport(g: Workspace["guides"][number]) {
  return {
    product: "GuideCheck",
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    sample: g.sample,
    notice:
      "Changed content indicates a potential issue. Tested is a human assertion, not automated verification. Inherited evidence retains its original timestamp. This report is not tamper-proof.",
    guide: g,
  };
}
export function workspaceBackup(state: Workspace) {
  return {
    product: "GuideCheck",
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    notice:
      "Private workspace backup. Contains all guides, screenshots, versions and self-reported review evidence. Keep it somewhere safe.",
    workspace: state,
  };
}
export const MAX_BACKUP_BYTES = 50_000_000;
export function serializeWorkspaceBackup(state: Workspace): string {
  const source = JSON.stringify(workspaceBackup(state));
  if (new TextEncoder().encode(source).length > MAX_BACKUP_BYTES)
    throw new InputError(
      "Workspace reached its 50 MB backup limit. Export a backup before adding more history.",
    );
  return source;
}
const record = (v: unknown, name: string): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new InputError(`${name} must be an object.`);
  return v as Record<string, unknown>;
};
const id = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v))
    throw new InputError(`${name} is invalid.`);
  return v;
};
const date = (v: unknown): string => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    v.length > 40
  )
    throw new InputError("Backup contains an invalid timestamp.");
  return v;
};
const text = (v: unknown, max: number): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new InputError("Backup contains invalid review text.");
  return v;
};
export function validateWorkspace(value: unknown): Workspace {
  const w = record(value, "Workspace");
  if (
    w.schemaVersion !== 1 ||
    !Number.isSafeInteger(w.revision) ||
    Number(w.revision) < 0 ||
    !Array.isArray(w.guides) ||
    w.guides.length > 100
  )
    throw new InputError("Unsupported workspace schema or limits.");
  const allIds = new Set<string>();
  const unique = (v: unknown, name: string) => {
    const key = id(v, name);
    if (allIds.has(key))
      throw new InputError("Backup contains duplicate identifiers.");
    allIds.add(key);
    return key;
  };
  const guides = w.guides.map((raw) => {
    const g = record(raw, "Guide");
    if (
      typeof g.sample !== "boolean" ||
      !Array.isArray(g.versions) ||
      !g.versions.length ||
      g.versions.length > 200 ||
      !Array.isArray(g.reviews) ||
      g.reviews.length > 20000
    )
      throw new InputError("Backup guide history exceeds supported limits.");
    const guideId = unique(g.id, "Guide ID");
    const versions = g.versions.map((raw, i): Version => {
      const v = record(raw, "Version");
      if (v.number !== i + 1)
        throw new InputError("Backup version sequence is invalid.");
      return {
        ...validateGuide(v),
        id: unique(v.id, "Version ID"),
        number: i + 1,
        createdAt: date(v.createdAt),
        note: text(v.note, 500),
      };
    });
    const reviews = g.reviews.map((raw): Review => {
      const r = record(raw, "Review");
      const versionId = id(r.versionId, "Review version");
      const v = versions.find((v) => v.id === versionId);
      const stepId = id(r.stepId, "Review step");
      if (
        !v?.steps.some((s) => s.id === stepId) ||
        typeof r.status !== "string" ||
        !["tested", "needs_update"].includes(r.status)
      )
        throw new InputError("Backup review references or status are invalid.");
      const inheritedFrom =
        r.inheritedFrom === undefined
          ? undefined
          : id(r.inheritedFrom, "Evidence source");
      if (
        inheritedFrom &&
        !versions.some(
          (old) =>
            old.id === inheritedFrom &&
            old.number < v.number &&
            old.steps.some((s) => s.id === stepId),
        )
      )
        throw new InputError(
          "Backup carried evidence has an invalid source version.",
        );
      return {
        id: unique(r.id, "Review ID"),
        versionId,
        stepId,
        status: r.status as Review["status"],
        reviewer: text(r.reviewer, 100),
        note: text(r.note, 2000),
        context: text(r.context, 500),
        createdAt: date(r.createdAt),
        ...(inheritedFrom ? { inheritedFrom } : {}),
      };
    });
    const evidenceKey = (r: Review, versionId: string) =>
      JSON.stringify([
        versionId,
        r.stepId,
        r.status,
        r.reviewer,
        r.note,
        r.context,
        r.createdAt,
      ]);
    const originals = new Set(
      reviews
        .filter((r) => !r.inheritedFrom)
        .map((r) => evidenceKey(r, r.versionId)),
    );
    const continuity = new Map<string, Map<string, number>>();
    for (const [index, v] of versions.entries()) {
      const starts = new Map(v.steps.map((s) => [s.id, v.number]));
      const previous = versions[index - 1];
      if (previous && previous.description === v.description)
        for (const change of compare(previous.steps, v.steps))
          if (change.kind === "unchanged")
            starts.set(change.id, continuity.get(previous.id)!.get(change.id)!);
      continuity.set(v.id, starts);
    }
    for (const review of reviews) {
      if (!review.inheritedFrom) continue;
      const source = versions.find((v) => v.id === review.inheritedFrom)!;
      if (
        !originals.has(evidenceKey(review, source.id)) ||
        source.number < continuity.get(review.versionId)!.get(review.stepId)!
      )
        throw new InputError(
          "Backup carried evidence must match an original review and unchanged instructions, order, and guide context.",
        );
    }
    return { id: guideId, sample: g.sample, versions, reviews };
  });
  return { schemaVersion: 1, revision: Number(w.revision), guides };
}
export function parseWorkspaceBackup(source: string): Workspace {
  if (
    !source.trim() ||
    new TextEncoder().encode(source).length > MAX_BACKUP_BYTES
  )
    throw new InputError("Workspace backups must be smaller than 50 MB.");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new InputError("Invalid workspace backup JSON.");
  }
  const b = record(value, "Backup");
  if (b.product !== "GuideCheck" || b.backupVersion !== 1)
    throw new InputError(
      "Choose a GuideCheck workspace backup, not a guide or verification report.",
    );
  return validateWorkspace(b.workspace);
}
