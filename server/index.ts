import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createServer as createViteServer } from "vite";
import { Store } from "./store.ts";
import { apiServer } from "./app.ts";
const port = Number(process.env.PORT ?? 4381);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT must be an integer from 1024 to 65535.");
const production = process.argv.includes("--production");
const root = resolve(import.meta.dirname, "..");
const dbPath =
  process.env.GUIDECHECK_DB ?? resolve(root, "data", "guidecheck.sqlite");
const store = new Store(dbPath, process.env.GUIDECHECK_EMPTY !== "1");
const server = apiServer(store, port, (req, res) => {
  if (!production) {
    vite!.middlewares(req, res, () => {
      res.writeHead(404);
      res.end("Not found");
    });
    return;
  }
  const requestPath = decodeURIComponent(
    new URL(req.url ?? "/", `http://127.0.0.1:${port}`).pathname,
  );
  const base = resolve(root, "dist");
  const file = resolve(base, `.${requestPath}`);
  if (
    file !== base &&
    !file.startsWith(base + "\\") &&
    !file.startsWith(base + "/")
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  const actual =
    existsSync(file) && extname(file) ? file : resolve(base, "index.html");
  const mime: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  try {
    res.writeHead(200, {
      "Content-Type": mime[extname(actual)] ?? "application/octet-stream",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(readFileSync(actual));
  } catch {
    res.writeHead(500);
    res.end("Build GuideCheck before starting production mode.");
  }
});
const vite = production
  ? undefined
  : await createViteServer({
      root,
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
server.listen(port, "127.0.0.1", () =>
  console.log(
    `GuideCheck running at http://127.0.0.1:${port} (${production ? "production" : "development"}); database ${dbPath}`,
  ),
);
function shutdown() {
  server.close(() => {
    store.close();
    void vite?.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
