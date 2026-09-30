import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import {
  InputError,
  parseImport,
  toMarkdown,
  type Guide,
} from "../src/core.ts";
import { Store, ConflictError } from "./store.ts";
import {
  guideReport,
  serializeWorkspaceBackup,
  parseWorkspaceBackup,
} from "../src/workspace.ts";
const LIMIT = 6_000_000;
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(
  req: IncomingMessage,
  limit = LIMIT,
): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new InputError("Use application/json for imports and reviews.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new InputError(
        `Request exceeds the ${limit / 1_000_000} MB limit.`,
      );
    chunks.push(chunk);
  }
  try {
    const b: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new InputError("Request body must be a JSON object.");
  }
}
export function report(g: Guide) {
  return guideReport(g);
}
export function apiServer(
  store: Store,
  port: number,
  onPage?: (req: IncomingMessage, res: ServerResponse) => void,
) {
  const server = createServer(async (req, res) => {
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(req.headers.host ?? ""))
      return send(res, 403, {
        error: "This workspace only accepts requests to its loopback host.",
      });
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)
    )
      return send(res, 403, {
        error: "Cross-origin requests are not accepted.",
      });
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let url: URL;
    try {
      url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    } catch {
      return send(res, 400, { error: "Invalid request path." });
    }
    if (!url.pathname.startsWith("/api/")) {
      if (onPage) {
        try {
          return onPage(req, res);
        } catch {
          return send(res, 400, { error: "Invalid request path." });
        }
      }
      return send(res, 404, { error: "Not found." });
    }
    try {
      if (req.method === "GET" && url.pathname === "/api/workspace")
        return send(res, 200, store.read());
      if (req.method === "GET" && url.pathname === "/api/workspace/export") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="guidecheck-workspace.json"',
          "Cache-Control": "no-store",
        });
        res.end(serializeWorkspaceBackup(store.read()));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/health")
        return send(res, 200, {
          ok: true,
          id: randomUUID(),
          storage: "sqlite",
          schemaVersion: 1,
        });
      const exportMatch = /^\/api\/guides\/([\w-]+)\/export$/.exec(
        url.pathname,
      );
      if (req.method === "GET" && exportMatch) {
        const g = store.read().guides.find((g) => g.id === exportMatch[1]);
        if (!g) return send(res, 404, { error: "Guide not found." });
        const v = url.searchParams.has("version")
          ? g.versions.find((v) => v.id === url.searchParams.get("version"))
          : g.versions.at(-1);
        if (!v) return send(res, 404, { error: "Version not found." });
        const format = url.searchParams.get("format") ?? "markdown";
        if (!["markdown", "json", "report"].includes(format))
          throw new InputError(
            "Export format must be markdown, json, or report.",
          );
        const filename = `guidecheck-${g.id.slice(0, 8)}-v${v.number}${format === "report" ? "-verification" : ""}.${format === "markdown" ? "md" : "json"}`;
        res.writeHead(200, {
          "Content-Type":
            format === "markdown"
              ? "text/markdown; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        });
        res.end(
          format === "markdown"
            ? toMarkdown(v)
            : JSON.stringify(
                format === "report"
                  ? report(g)
                  : {
                      title: v.title,
                      owner: v.owner,
                      description: v.description,
                      steps: v.steps,
                    },
                null,
                2,
              ),
        );
        return;
      }
      if (req.method !== "POST")
        return send(res, 404, { error: "Unknown API endpoint." });
      const b = await body(
        req,
        url.pathname === "/api/workspace/restore" ? 60_000_000 : LIMIT,
      );
      if (
        !Number.isInteger(b.expectedRevision) ||
        Number(b.expectedRevision) < 0
      )
        throw new InputError("A valid workspace revision is required.");
      const expected = Number(b.expectedRevision);
      if (url.pathname === "/api/workspace/restore") {
        if (typeof b.source !== "string")
          throw new InputError("Choose a workspace backup.");
        return send(
          res,
          200,
          store.restore(parseWorkspaceBackup(b.source), expected),
        );
      }
      if (url.pathname === "/api/guides") {
        if (
          typeof b.source !== "string" ||
          typeof b.format !== "string" ||
          !["json", "markdown"].includes(b.format)
        )
          throw new InputError(
            "Choose JSON or Markdown and include guide content.",
          );
        return send(
          res,
          201,
          store.create(
            parseImport(b.source, b.format as "json" | "markdown"),
            expected,
          ),
        );
      }
      const match = /^\/api\/guides\/([\w-]+)\/(versions|reviews)$/.exec(
        url.pathname,
      );
      if (!match) return send(res, 404, { error: "Unknown API endpoint." });
      if (match[2] === "reviews")
        return send(res, 200, store.review(match[1], b, expected));
      if (
        typeof b.source !== "string" ||
        typeof b.format !== "string" ||
        !["json", "markdown"].includes(b.format) ||
        typeof b.note !== "string" ||
        typeof b.baseVersionId !== "string"
      )
        throw new InputError(
          "Version content, format, note, and base version are required.",
        );
      return send(
        res,
        201,
        store.append(
          match[1],
          parseImport(b.source, b.format as "json" | "markdown"),
          b.note,
          expected,
          b.baseVersionId,
        ),
      );
    } catch (e) {
      if (e instanceof ConflictError)
        return send(res, 409, { error: e.message });
      if (e instanceof InputError) return send(res, 400, { error: e.message });
      console.error("Request failed:", e);
      send(res, 500, {
        error:
          "The request could not be saved. Existing data is unchanged. Check the local server log.",
      });
    }
  });
  return server;
}
