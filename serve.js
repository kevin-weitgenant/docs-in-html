#!/usr/bin/env node
// htmlovermd — zero-build dev server for folders of HTML docs.
// Auto sidebar tree (from your folders) + live reload + Mermaid pan/zoom.
//
//   htmlovermd [dir] [--port N] [--no-open]   serve a folder (default: current dir)
//   htmlovermd init [dir]                     scaffold a starter index.html

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
//  - mermaid-zoom (only docs with .mermaid blocks that don't already have pan/zoom)
function injectScripts(html) {
  const tags = [`<script src="/__docs__/reload.js"></script>`];
  if (/\bid\s*=\s*["']docList["']/.test(html)) tags.push(`<script src="/__docs__/nav.js"></script>`);
  if (/\bclass\s*=\s*["'][^"']*\bmermaid\b/.test(html) && !/mermaid-zoom|svg-pan-zoom/.test(html)) {
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

// ── CLI ──────────────────────────────────────────────────────────────────
function help() {
  console.log(`htmlovermd — zero-build dev server for HTML docs.

Usage:
  htmlovermd [dir] [--port N] [--no-open]   serve a folder (default: current dir)
  htmlovermd init [dir]                     scaffold a starter index.html

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

  if (raw.startsWith("/__docs__/")) {
    const f = path.join(CLIENT_DIR, path.normalize(raw.slice("/__docs__/".length)));
    if (f !== CLIENT_DIR && !f.startsWith(CLIENT_DIR + path.sep)) return send(res, 404, "404");
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, "404");
    return send(res, 200, fs.readFileSync(f), { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
  }

  let urlPath = decodeURIComponent(raw);
  if (urlPath === "/") {
    const idx = path.join(ROOT, "index.html");
    if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return serveFile(idx, res);
    return send(res, 200, injectScripts(SHELL), { "Content-Type": "text/html; charset=utf-8" });
  }

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) return send(res, 403, "403 Forbidden");
  serveFile(filePath, res);
});

server.on("close", () => reload.close());
server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`htmlovermd · serving ${ROOT}`);
  console.log(`  → ${url}`);
  if (doOpen) {
    const cmd = process.platform === "win32" ? `start "" "${url}"`
      : process.platform === "darwin" ? `open "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
