// Build a tree of the docs folder: folders (collapsible) + .html files.
// Hides dotfiles, _-prefixed names, and index.html (the shell).
// Empty folders are kept so the sidebar can create/reveal them (mkdir feature).

const fs = require("node:fs");
const path = require("node:path");

// "auth-service.html" → "Auth Service"; "backend" → "Backend"
// Capitalize the first letter of each word. Per-word with String#toUpperCase
// (Unicode-aware) — NOT /\b\w/ which is ASCII-only and mangles "Integração" → "IntegraçãO".
function humanize(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^./u, (c) => c.toUpperCase()))
    .join(" ")
    .trim();
}

function buildTree(root) {
  // Manual drag-order (written by POST /__order__): { "": ["b.html","a.html"], "guides": [...] }
  let order = {};
  try { order = JSON.parse(fs.readFileSync(path.join(root, "_order.json"), "utf8")); } catch {}
  // Per-entry icons (written by hand or by an AI assistant):
  // { "guides": "book-open", "guides/deploy.html": "rocket", "dados": "🧮" }
  // Values are either a Lucide-style name (rendered from the embedded SVG set
  // in nav.js) or a non-ASCII string, which renders as-is (emoji).
  let icons = {};
  try { icons = JSON.parse(fs.readFileSync(path.join(root, "_icons.json"), "utf8")); } catch {}
  const sortByOrder = (rel, entries) => {
    const ord = order[rel || ""] || [];
    return entries.slice().sort((a, b) => {
      const ia = ord.indexOf(a.name), ib = ord.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;              // both pinned → saved order
      if (ia !== -1) return -1;                                 // pinned first
      if (ib !== -1) return 1;
      return a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1;
    });
  };
  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    entries = sortByOrder(rel, entries);
    const nodes = [];
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.startsWith("_")) continue; // hidden / template
      const childRel = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) {
        const children = walk(path.join(dir, e.name), childRel);
        const node = { type: "folder", name: humanize(e.name), path: childRel, children }; // keep even when empty
        if (typeof icons[childRel] === "string") node.icon = icons[childRel];
        nodes.push(node);
      } else if (e.isFile() && /\.html?$/i.test(e.name)) {
        if (e.name.toLowerCase() === "index.html") continue; // the shell itself
        const node = { type: "doc", name: humanize(e.name), path: childRel };
        if (typeof icons[childRel] === "string") node.icon = icons[childRel];
        nodes.push(node);
      }
    }
    return nodes;
  }
  return walk(root, "");
}

module.exports = { buildTree };
