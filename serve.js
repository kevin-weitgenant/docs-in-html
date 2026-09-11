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
//  - edit client (every doc EXCEPT the shell — inline WYSIWYG editing)
//  - mermaid-zoom (docs with Mermaid blocks OR standalone diagram SVGs:
//    <figure>, or .panzoom/.diagram/.zoomable — that don't already have pan/zoom)
// Detection is tag-context only: a page that merely *mentions* "id=\"docList\""
// or "mermaid-zoom" in prose (e.g. docs about this very package) must not
// be mistaken for a shell or for a page that ships its own pan/zoom.
// Every injected tag carries data-injected: the editor strips them before
// saving the page back to disk via /__save__.
function injectScripts(html) {
  const isShell = /<[^>]+\bid\s*=\s*["']docList["']/i.test(html);
  const tags = [`<script src="/__docs__/reload.js" data-injected></script>`];
  if (isShell) tags.push(`<script src="/__docs__/nav.js" data-injected></script>`);
  else tags.push(`<script src="/__docs__/edit.js" data-injected defer></script>`);
  const wantsZoom =
    /\bclass\s*=\s*["'][^"']*\bmermaid\b/.test(html) ||
    /<figure[\s>]/i.test(html) ||
    /class\s*=\s*["'][^"']*\b(panzoom|diagram|zoomable)\b/i.test(html);
  const hasOwnZoom = /<script[^>]+src\s*=\s*["'][^"']*(?:mermaid-zoom|svg-pan-zoom)/i.test(html);
  if (wantsZoom && !hasOwnZoom) {
    tags.push(`<script src="/__docs__/mermaid-zoom.js" data-injected defer></script>`);
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
  -p, --port N     port (default 8000, or $PORT; if the default is busy the
                   next free port is used with a warning — an explicit --port
                   must be free or the server exits with an error)
      --no-open    don't open the browser automatically
  -h, --help       show this help
`);
}

const args = process.argv.slice(2);
let dir = ".";
let port = Number(process.env.PORT) || 8000;
let doOpen = true;
let portWasExplicit = false;
let mode = "serve";
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") { help(); process.exit(0); }
  else if (a === "init") mode = "init";
  else if (a === "-p" || a === "--port") { port = Number(args[++i]) || port; portWasExplicit = true; }
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
// Sidebar collapse animation variant ("reveal" | "slide" | "guide"), from an
// optional ROOT/_config.json — e.g. { "sidebarAnim": "slide" }. Default: guide.
function readAnim() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, "_config.json"), "utf8")).sidebarAnim;
    return ["reveal", "slide", "guide"].includes(v) ? v : "guide";
  } catch { return "guide"; }
}

// Keep _icons.json keys in sync when files/folders are renamed/moved/deleted
// from the sidebar — same idea as the _order.json bookkeeping.
function loadIcons() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "_icons.json"), "utf8")); } catch { return null; }
}
function saveIcons(data) {
  try { fs.writeFileSync(path.join(ROOT, "_icons.json"), JSON.stringify(data, null, 2) + "\n"); } catch {}
}
function shiftIcons(from, to) { // rename/move: rewrite the key and descendant keys
  const data = loadIcons();
  if (!data) return;
  let changed = false;
  const out = {};
  for (const k of Object.keys(data)) {
    if (k === from) { out[to] = data[k]; changed = true; }
    else if (k.startsWith(from + "/")) { out[to + k.slice(from.length)] = data[k]; changed = true; }
    else out[k] = data[k];
  }
  if (changed) saveIcons(out);
}
function pruneIcons(rel) { // delete: drop the key and descendant keys
  const data = loadIcons();
  if (!data) return;
  const out = {};
  let changed = false;
  for (const k of Object.keys(data)) {
    if (k === rel || k.startsWith(rel + "/")) { changed = true; continue; }
    out[k] = data[k];
  }
  if (changed) saveIcons(out);
}

const reload = createReload(ROOT);

const server = http.createServer((req, res) => {
  if (reload.handle(req, res)) return; // SSE channel

  const raw = (req.url || "/").split("?")[0];

  if (raw === "/__manifest__") {
    const body = JSON.stringify({ root: ROOT, sep: path.sep, anim: readAnim(), tree: buildTree(ROOT) });
    return send(res, 200, body, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }

  // ── file-management endpoints (delete / rename / mkdir) ──────────────────
  // Shared guards: JSON body cap, relative path inside ROOT, sane segment names.
  function readJsonBody(req, cb, cap = 4096) {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > cap) req.destroy(); });
    req.on("end", () => { let j; try { j = JSON.parse(body); } catch (e) { return cb(null); } cb(j); });
  }
  // "guides/v2" → "guides/v2" | null (must stay inside ROOT, no weird names)
  function safeRelPath(p) {
    if (typeof p !== "string" || p.includes("\\") || p.startsWith("/")) return null;
    const segs = p.split("/").filter(Boolean);
    if (!segs.length || segs.includes("..")) return null;
    for (const s of segs)
      if (!s || s.startsWith(".") || s.startsWith("_") || /[<>:"|?*\x00-\x1f]/.test(s)) return null;
    return segs.join("/");
  }
  function resolveIn(p) {
    const rel = safeRelPath(p);
    if (rel === null) return null;
    const abs = path.resolve(ROOT, rel);
    if (!abs.startsWith(ROOT + path.sep)) return null;
    return { rel, abs };
  }

  // Delete a doc or an EMPTY folder from the sidebar (POST /__delete__ {path}).
  if (req.method === "POST" && raw === "/__delete__") {
    return readJsonBody(req, (j) => {
      const t = resolveIn(j && j.path);
      if (!t) return send(res, 400, "400 Bad Request");
      fs.stat(t.abs, (err, st) => {
        if (err) return send(res, 404, "404 Not Found");
        if (st.isDirectory()) {
          fs.rmdir(t.abs, (e2) => { // rmdir refuses non-empty folders — safety by design
            if (e2) return send(res, 409, "409 Folder is not empty");
            pruneIcons(t.rel);
            send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
          });
        } else {
          if (!/\.html?$/i.test(t.rel)) return send(res, 400, "400 Bad Request");
          fs.unlink(t.abs, (e2) => {
            if (e2) return send(res, 404, "404 Not Found");
            pruneIcons(t.rel);
            send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
          });
        }
      });
    });
  }

  // Rename / move a doc or folder (POST /__rename__ {from,to}). Same containment,
  // extension and collision rules on both sides; 409 if the target exists.
  if (req.method === "POST" && raw === "/__rename__") {
    return readJsonBody(req, (j) => {
      const from = resolveIn(j && j.from);
      const to = resolveIn(j && j.to);
      if (!from || !to || from.rel === to.rel) return send(res, 400, "400 Bad Request");
      fs.stat(from.abs, (err, st) => {
        if (err || !st) return send(res, 404, "404 Not Found");
        if (st.isFile()) {
          if (!/\.html?$/i.test(from.rel) || !/\.html?$/i.test(to.rel)) return send(res, 400, "400 Bad Request");
          if (path.basename(to.rel).toLowerCase() === "index.html") return send(res, 400, "400 Bad Request");
        } else if (to.rel.startsWith(from.rel + "/")) {
          return send(res, 400, "400 Cannot move a folder into itself");
        }
        fs.access(to.abs, (e2) => {
          if (!e2) return send(res, 409, "409 Target already exists");
          fs.rename(from.abs, to.abs, (e3) => {
            if (e3) return send(res, 500, "500 Rename failed");
            shiftIcons(from.rel, to.rel);
            send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
          });
        });
      });
    });
  }

  // Create a folder (POST /__mkdir__ {path}) — 409 if it already exists.
  if (req.method === "POST" && raw === "/__mkdir__") {
    return readJsonBody(req, (j) => {
      const t = resolveIn(j && j.path);
      if (!t) return send(res, 400, "400 Bad Request");
      fs.access(t.abs, (existErr) => {
        if (!existErr) return send(res, 409, "409 Folder already exists");
        fs.mkdir(t.abs, { recursive: true }, (err) => {
          if (err) return send(res, 500, "500 mkdir failed");
          send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
        });
      });
    });
  }

  // Save an inline-edited doc (POST /__save__ {path, html}) — the editor client
  // serializes the page minus its data-injected tags; we validate the path with
  // the same guards as the other endpoints and write the file back in place.
  if (req.method === "POST" && raw === "/__save__") {
    return readJsonBody(req, (j) => {
      const t = resolveIn(j && j.path);
      if (!t || !/\.html?$/i.test(t.rel) || typeof j.html !== "string")
        return send(res, 400, "400 Bad Request");
      fs.writeFile(t.abs, j.html, "utf8", (err) => {
        if (err) return send(res, 500, "500 write failed");
        send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
      });
    }, 10 * 1024 * 1024); // whole-page HTML — allow up to 10 MB
  }

  // Persist a manual drag-order for one folder (POST /__order__ {folder, order}).
  // Stored in ROOT/_order.json — the leading _ keeps it hidden from the manifest.
  if (req.method === "POST" && raw === "/__order__") {
    return readJsonBody(req, (j) => {
      const folder = j && j.folder === "" ? "" : safeRelPath(j.folder);
      const order = j && Array.isArray(j.order) ? j.order : null;
      if (folder === null || !order || order.some((s) => typeof s !== "string" || !safeRelPath(s)))
        return send(res, 400, "400 Bad Request");
      const file = path.join(ROOT, "_order.json");
      let data = {};
      try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
      data[folder] = order;
      fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", (err) => {
        if (err) return send(res, 500, "500 write failed");
        send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
      });
    });
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

// If --port was passed explicitly, it's a request, not a hint: succeed on that
// exact port or die with a clear message. Otherwise (default/$PORT) fall back
// to the next free port, with a warning, so a second docs-in-html serving
// another folder just works.
const MAX_FALLBACKS = 20;
function start(attemptPort, attemptsLeft) {
  let printed = false;
  const srv = server.listen(attemptPort, () => {
    // On Windows the 'listening' callback can fire before a pending EADDRINUSE;
    // defer the banner one tick so a failed attempt never prints.
    setImmediate(() => {
      if (printed) return;
      printed = true;
      const url = `http://localhost:${attemptPort}`;
      console.log(`docs-in-html · serving ${ROOT}`);
      if (attemptPort !== port)
        console.log(`  ⚠ porta ${port} está em uso — usando ${attemptPort}`);
      console.log(`  → ${url}`);
      if (doOpen) {
        const cmd = process.platform === "win32" ? `start "" "${url}"`
          : process.platform === "darwin" ? `open "${url}"`
          : `xdg-open "${url}"`;
        exec(cmd, () => {});
      }
    });
  });
  srv.once("error", (err) => {
    printed = true;
    if (err.code !== "EADDRINUSE") {
      const tip = err.code === "EACCES"
        ? " (porta privilegiada? tente uma alta, ex.: --port 8000)" : "";
      console.error(`erro: não foi possível abrir a porta ${attemptPort}${tip}`);
      if (err.code !== "EACCES") console.error(`       ${err.message}`);
      process.exit(1);
    }
    if (portWasExplicit) {
      console.error(`erro: porta ${attemptPort} já está em uso.`);
      console.error("       pode ser outra instância de docs-in-html; feche-a, ou rode sem --port para auto-escolher a próxima livre.");
      process.exit(1);
    }
    if (attemptsLeft <= 0) {
      console.error(`erro: nenhuma porta livre a partir de ${port} (tentou até ${attemptPort}).`);
      console.error("       feche o outro servidor ou passe --port N.");
      process.exit(1);
    }
    srv.close();
    start(attemptPort + 1, attemptsLeft - 1);
  });
}
start(port, portWasExplicit ? 0 : MAX_FALLBACKS - 1);
