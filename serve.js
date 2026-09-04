#!/usr/bin/env node
// docs-in-html — zero-build dev server for folders of HTML docs.
// Auto sidebar tree (from your folders) + live reload + Mermaid pan/zoom.
//
//   docs-in-html [dir] [--port N] [--no-open]   serve a folder (default: current dir)
//   docs-in-html init [dir]                     scaffold a starter index.html

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { exec } = require("node:child_process");
const { createReload } = require("./reload.js");
const { buildTree } = require("./manifest.js");
const { SHELL } = require("./shell.js");

const CLIENT_DIR = path.join(__dirname, "client");

const MIME = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

// Splice dev scripts into HTML:
//  - reload client (always)
//  - nav client (only the shell — a page with #docList)
//  - mermaid-zoom (docs with Mermaid blocks OR standalone diagram SVGs:
//    <figure>, or .panzoom/.diagram/.zoomable — that don't already have pan/zoom)
function injectScripts(html) {
  const tags = [`<script src="/__docs__/reload.js"></script>`];
  if (/\bid\s*=\s*["']docList["']/.test(html)) tags.push(`<script src="/__docs__/nav.js"></script>`);
  const wantsZoom =
    /\bclass\s*=\s*["'][^"']*\bmermaid\b/.test(html) ||
    /<figure[\s>]/i.test(html) ||
    /class\s*=\s*["'][^"']*\b(panzoom|diagram|zoomable)\b/i.test(html);
  if (wantsZoom && !/mermaid-zoom|svg-pan-zoom/.test(html)) {
    tags.push(`<script src="/__docs__/mermaid-zoom.js" defer></script>`);
  }
  const block = tags.join("");
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, block + "$&") : html + block;
}

function serveFile(filePath, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "404 Not Found");
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    fs.readFile(filePath, (e, data) => {
      if (e) return send(res, 500, "500 Internal Server Error");
      const body = ext === ".html" ? injectScripts(data.toString("utf8")) : data;
      send(res, 200, body, { "Content-Type": type });
    });
  });
}

// The shell page: the user's index.html when present, otherwise the built-in one.
// Can be served at a deep URL (e.g. /docs/foo.html) so that a top-level visit
// there reopens the shell around the doc — <base href="/"> keeps any relative
// asset references in a custom index.html resolving from the root.
function serveShell(res) {
  const idx = path.join(ROOT, "index.html");
  let html =
    fs.existsSync(idx) && fs.statSync(idx).isFile()
      ? fs.readFileSync(idx, "utf8")
      : SHELL;
  if (!/<base\s/i.test(html)) {
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => m + '\n<base href="/">')
      : '<base href="/">\n' + html;
  }
  send(res, 200, injectScripts(html), { "Content-Type": "text/html; charset=utf-8" });
}

// ── CLI ──────────────────────────────────────────────────────────────────
function help() {
  console.log(`docs-in-html — zero-build dev server for HTML docs.

Usage:
  docs-in-html [dir] [--port N] [--no-open]   serve a folder (default: current dir)
  docs-in-html init [dir]                     scaffold a starter index.html

Options:
  -p, --port N     port (default 8000, or $PORT)
      --no-open    don't open the browser automatically
  -h, --help       show this help
`);
}

const args = process.argv.slice(2);
let dir = ".";
let port = Number(process.env.PORT) || 8000;
let doOpen = true;
let mode = "serve";
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") { help(); process.exit(0); }
  else if (a === "init") mode = "init";
  else if (a === "-p" || a === "--port") port = Number(args[++i]) || port;
  else if (a === "--no-open") doOpen = false;
  else if (a === "-o" || a === "--open") doOpen = true;
  else if (!a.startsWith("-")) dir = a;
}

const ROOT = path.resolve(dir);

if (mode === "init") {
  require("./init.js").init(ROOT);
  process.exit(0);
}

// ── server ───────────────────────────────────────────────────────────────
const reload = createReload(ROOT);

const server = http.createServer((req, res) => {
  if (reload.handle(req, res)) return; // SSE channel

  const raw = (req.url || "/").split("?")[0];

  if (raw === "/__manifest__") {
    return send(res, 200, JSON.stringify(buildTree(ROOT)), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }

  // Delete a doc from the sidebar (POST /__delete__ with JSON {path}).
  if (req.method === "POST" && raw === "/__delete__") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      let p;
      try { p = JSON.parse(body).path; } catch (e) { return send(res, 400, "400 Bad Request"); }
      if (typeof p !== "string" || !/\.html?$/i.test(p)) return send(res, 400, "400 Bad Request");
      const filePath = path.resolve(ROOT, p);
      if (!filePath.startsWith(ROOT + path.sep)) return send(res, 403, "403 Forbidden");
      fs.unlink(filePath, (err) => {
        if (err) return send(res, 404, "404 Not Found");
        send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
      });
    });
    return;
  }

  if (raw.startsWith("/__docs__/")) {
    const f = path.join(CLIENT_DIR, path.normalize(raw.slice("/__docs__/".length)));
    if (f !== CLIENT_DIR && !f.startsWith(CLIENT_DIR + path.sep)) return send(res, 404, "404");
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, "404");
    return send(res, 200, fs.readFileSync(f), { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
  }

  let urlPath = decodeURIComponent(raw);
  if (urlPath === "/") return serveShell(res);

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) return send(res, 403, "403 Forbidden");

  // Deep URL: a top-level navigation to a doc (address bar, F5, target="_top")
  // gets the shell wrapped around it. The iframe's own request carries
  // Sec-Fetch-Dest: iframe and still gets the bare document — no recursion.
  // Requests without the header (curl, old browsers) get the bare doc too.
  if (
    /\.html?$/i.test(urlPath) &&
    req.headers["sec-fetch-dest"] === "document" &&
    path.resolve(filePath) !== path.resolve(path.join(ROOT, "index.html"))
  ) {
    return serveShell(res);
  }
  serveFile(filePath, res);
});

server.on("close", () => reload.close());
server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`docs-in-html · serving ${ROOT}`);
  console.log(`  → ${url}`);
  if (doOpen) {
    const cmd = process.platform === "win32" ? `start "" "${url}"`
      : process.platform === "darwin" ? `open "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
