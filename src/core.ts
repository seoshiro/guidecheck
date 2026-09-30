export type Screenshot = { name: string; dataUrl: string };
export type Step = {
  id: string;
  title: string;
  text: string;
  links: string[];
  screenshots: Screenshot[];
};
export type GuideInput = {
  title: string;
  owner: string;
  description: string;
  steps: Step[];
};
export type Version = GuideInput & {
  id: string;
  number: number;
  createdAt: string;
  note: string;
};
export type Review = {
  id: string;
  versionId: string;
  stepId: string;
  status: "tested" | "needs_update";
  reviewer: string;
  note: string;
  context: string;
  createdAt: string;
  inheritedFrom?: string;
};
export type Guide = {
  id: string;
  sample: boolean;
  versions: Version[];
  reviews: Review[];
};
export type Workspace = { schemaVersion: 1; revision: number; guides: Guide[] };
export type Change = {
  id: string;
  before?: Step;
  after?: Step;
  kind: "added" | "removed" | "changed" | "unchanged";
  reasons: string[];
  beforeIndex: number;
  afterIndex: number;
};
export class InputError extends Error {}
const MAX_IMAGE = 700_000;
function string(
  value: unknown,
  name: string,
  max: number,
  required = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new InputError(
      `${name} must be ${required ? "non-empty " : ""}text, up to ${max} characters.`,
    );
  return value.trim();
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function hasControl(value: string): boolean {
  return Array.from(value).some(
    (ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127,
  );
}
function singleLine(value: string, name: string): string {
  if (hasControl(value))
    throw new InputError(
      `${name} must be a single line without control characters.`,
    );
  return value;
}
export function safeUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      !hasControl(value) &&
      !/\s/.test(value) &&
      ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
export function validateScreenshot(value: unknown): Screenshot {
  const s = object(value, "Screenshot");
  const name = singleLine(
    string(s.name, "Screenshot name", 120),
    "Screenshot name",
  );
  const dataUrl = string(s.dataUrl, "Screenshot data", MAX_IMAGE);
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0)
    throw new InputError(
      "Screenshots must be embedded PNG, JPEG, or WebP images (up to 500 KB). SVG, remote images, and file paths are not accepted.",
    );
  let bytes: string;
  try {
    bytes = atob(match[2]);
  } catch {
    throw new InputError("Screenshot base64 is invalid.");
  }
  if (bytes.length > 500_000)
    throw new InputError("Each screenshot must be smaller than 500 KB.");
  const valid =
    match[1] === "png"
      ? bytes.startsWith("\x89PNG\r\n\x1a\n") &&
        bytes.length > 40 &&
        bytes.slice(-8, -4) === "IEND"
      : match[1] === "jpeg"
        ? bytes.startsWith("\xff\xd8\xff") &&
          bytes.endsWith("\xff\xd9") &&
          bytes.length > 20
        : bytes.startsWith("RIFF") &&
          bytes.slice(8, 12) === "WEBP" &&
          bytes.length > 20;
  if (!valid)
    throw new InputError(
      "Screenshot is truncated or does not match its declared image format.",
    );
  return { name, dataUrl };
}
export function validateGuide(value: unknown): GuideInput {
  const g = object(value, "Guide");
  const title = singleLine(string(g.title, "Guide title", 160), "Guide title");
  const owner = singleLine(string(g.owner ?? "", "Owner", 100, false), "Owner");
  const description = string(g.description ?? "", "Description", 2000, false);
  if (!Array.isArray(g.steps) || !g.steps.length || g.steps.length > 100)
    throw new InputError("A guide must contain 1–100 steps.");
  const ids = new Set<string>();
  const steps = g.steps.map((raw, i): Step => {
    const s = object(raw, `Step ${i + 1}`);
    const id = string(s.id, `Step ${i + 1} ID`, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      throw new InputError(
        "Step IDs must be unique and use letters, numbers, hyphens, or underscores.",
      );
    ids.add(id);
    const title = singleLine(
      string(s.title, `Step ${i + 1} title`, 200),
      `Step ${i + 1} title`,
    );
    const text = string(
      s.text ?? "",
      `Step ${i + 1} instructions`,
      20000,
      false,
    );
    const links = s.links ?? [];
    if (
      !Array.isArray(links) ||
      links.length > 20 ||
      links.some((l) => typeof l !== "string" || l.length > 2000 || !safeUrl(l))
    )
      throw new InputError(
        `Step ${i + 1} links must be HTTP(S) URLs without credentials, up to 20 links.`,
      );
    const screenshots = s.screenshots ?? [];
    if (!Array.isArray(screenshots) || screenshots.length > 3)
      throw new InputError("Each step can have up to 3 screenshots.");
    return {
      id,
      title,
      text,
      links: [...new Set(links as string[])],
      screenshots: screenshots.map(validateScreenshot),
    };
  });
  return { title, owner, description, steps };
}
function markdownLinks(text: string): string[] {
  const links: string[] = [];
  for (const match of text.matchAll(/(?<!!)\[[^\]]*\]\(/g)) {
    let depth = 1,
      url = "",
      i = match.index! + match[0].length;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "\\" && i + 1 < text.length) {
        url += text[++i];
        continue;
      }
      if (ch === "(") depth++;
      if (ch === ")" && --depth === 0) break;
      url += ch;
    }
    if (depth !== 0 || !safeUrl(url))
      throw new InputError(
        "Markdown references need a complete HTTP(S) URL without whitespace or credentials.",
      );
    links.push(url);
  }
  return links;
}
export function parseImport(
  source: string,
  format: "json" | "markdown",
): GuideInput {
  if (!source.trim() || source.length > 5_000_000)
    throw new InputError("Import must contain text and be smaller than 5 MB.");
  if (format === "json") {
    let raw: unknown;
    try {
      raw = JSON.parse(source);
    } catch {
      throw new InputError("Invalid JSON. Check commas, quotes, and brackets.");
    }
    return validateGuide(raw);
  }
  const normalized = source.replace(/\r\n?/g, "\n");
  const heading = /^# (.+)$/m.exec(normalized);
  if (
    !heading ||
    normalized.match(/^# /gm)?.length !== 1 ||
    !normalized.trimStart().startsWith("# ")
  )
    throw new InputError(
      "Markdown needs exactly one # Guide title at the beginning and at least one ## Step heading.",
    );
  const blocks = normalized.split(/^## /m);
  const header = blocks.shift()!;
  if (!blocks.length || blocks.length > 100)
    throw new InputError("Markdown needs 1-100 ## Step headings.");
  const owner = /^Owner: (.*)$/im.exec(header)?.[1] ?? "";
  const description = header
    .replace(/^# .+$/m, "")
    .replace(/^Owner:.*$/im, "")
    .trim();
  const steps = blocks.map((block, i) => {
    const lines = block.split("\n");
    const title = lines.shift()!.trim();
    let text = lines.join("\n").trim();
    const id =
      /<!-- step:([a-zA-Z0-9_-]+) -->/.exec(text)?.[1] ?? `step-${i + 1}`;
    text = text.replace(/<!-- step:[a-zA-Z0-9_-]+ -->/g, "").trim();
    const linkMetadata = /^<!-- guidecheck-links:(.+) -->$/m.exec(text);
    let explicitLinks: unknown;
    if (linkMetadata) {
      try {
        explicitLinks = JSON.parse(linkMetadata[1]);
      } catch {
        throw new InputError("GuideCheck reference metadata is malformed.");
      }
      text = text.replace(linkMetadata[0], "").trim();
      const marker = "<!-- guidecheck-references:start -->\n";
      const end = "\n<!-- guidecheck-references:end -->";
      const start = text.lastIndexOf(marker);
      if (start >= 0 && text.endsWith(end)) {
        explicitLinks = markdownLinks(
          text.slice(start + marker.length, -end.length),
        );
        text = text.slice(0, start).trim();
      } else if (Array.isArray(explicitLinks) && explicitLinks.length)
        throw new InputError(
          "The exported reference section is missing. Keep the section to edit links, clear its links to remove them, or use JSON.",
        );
    }
    const screenshots: Screenshot[] = [];
    text = text
      .replace(
        /!\[((?:\\.|[^\]])*)\]\((data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)\)/g,
        (_all, name, dataUrl) => {
          screenshots.push({
            name: name.replace(/\\(.)/g, "$1") || "Screenshot",
            dataUrl,
          });
          return "";
        },
      )
      .trim();
    if (/!\[[^\]]*\]\(/.test(text))
      throw new InputError(
        "Markdown images must be embedded PNG, JPEG, or WebP data URLs. Remote images are not downloaded.",
      );
    const links = linkMetadata ? explicitLinks : markdownLinks(text);
    return { id, title, text, links, screenshots };
  });
  return validateGuide({ title: heading[1], owner, description, steps });
}
export function stepEqual(a: Step, b: Step): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function compare(before: Step[], after: Step[]): Change[] {
  const previous = new Map(before.map((s, i) => [s.id, { s, i }]));
  const result: Change[] = after.map((s, i) => {
    const old = previous.get(s.id);
    if (!old)
      return {
        id: s.id,
        after: s,
        kind: "added",
        reasons: ["New step"],
        beforeIndex: -1,
        afterIndex: i,
      };
    const reasons: string[] = [];
    if (old.s.title !== s.title) reasons.push("Title");
    if (old.s.text !== s.text) reasons.push("Instructions");
    if (JSON.stringify(old.s.links) !== JSON.stringify(s.links))
      reasons.push("Links");
    if (JSON.stringify(old.s.screenshots) !== JSON.stringify(s.screenshots))
      reasons.push("Screenshots");
    if (old.i !== i) reasons.push("Order");
    return {
      id: s.id,
      before: old.s,
      after: s,
      kind: reasons.length ? "changed" : "unchanged",
      reasons,
      beforeIndex: old.i,
      afterIndex: i,
    };
  });
  for (const [id, { s, i }] of previous)
    if (!after.some((n) => n.id === id))
      result.push({
        id,
        before: s,
        kind: "removed",
        reasons: ["Removed step"],
        beforeIndex: i,
        afterIndex: -1,
      });
  return result;
}
export function latestReview(
  guide: Guide,
  version: Version,
  stepId: string,
): Review | undefined {
  return guide.reviews
    .filter((r) => r.versionId === version.id && r.stepId === stepId)
    .at(-1);
}
export function counts(guide: Guide) {
  const v = guide.versions.at(-1)!;
  const result = {
    tested: 0,
    needs_update: 0,
    unreviewed: 0,
    total: v.steps.length,
  };
  for (const s of v.steps) {
    const review = latestReview(guide, v, s.id);
    result[review?.status ?? "unreviewed"]++;
  }
  return result;
}
export function toMarkdown(guide: GuideInput): string {
  return `# ${guide.title}\n\nOwner: ${guide.owner}\n\n${guide.description}\n\n${guide.steps.map((s) => `## ${s.title}\n<!-- step:${s.id} -->\n<!-- guidecheck-links:${JSON.stringify(s.links)} -->\n\n${s.text}${s.screenshots.map((img) => `\n\n![${img.name.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")}](${img.dataUrl})`).join("")}${s.links.length ? `\n\n<!-- guidecheck-references:start -->\n${s.links.map((l) => `[Reference](${l})`).join("\n")}\n<!-- guidecheck-references:end -->` : ""}`).join("\n\n")}\n`;
}
export function wordDiff(
  before: string,
  after: string,
): { text: string; type: "same" | "add" | "remove" }[] {
  const a = before.split(/(\s+)/),
    b = after.split(/(\s+)/);
  if (a.length * b.length > 120_000)
    return [
      { text: before, type: "remove" },
      { text: after, type: "add" },
    ];
  const dp = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { text: string; type: "same" | "add" | "remove" }[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ text: a[i++], type: "same" });
      j++;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j]))
      out.push({ text: b[j++], type: "add" });
    else out.push({ text: a[i++], type: "remove" });
  }
  return out;
}
