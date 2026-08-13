// Build a tree of the docs folder: folders (collapsible) + .html files.
// Hides dotfiles, _-prefixed names, and index.html (the shell). Empty folders are dropped.

const fs = require("node:fs");
const path = require("node:path");

// "auth-service.html" → "Auth Service"; "backend" → "Backend"
function humanize(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function buildTree(root) {
  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    entries.sort((a, b) =>
      a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1
    );
    const nodes = [];
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.startsWith("_")) continue; // hidden / template
      const childRel = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) {
        const children = walk(path.join(dir, e.name), childRel);
        if (children.length) nodes.push({ type: "folder", name: humanize(e.name), path: childRel, children });
      } else if (e.isFile() && /\.html?$/i.test(e.name)) {
        if (e.name.toLowerCase() === "index.html") continue; // the shell itself
        nodes.push({ type: "doc", name: humanize(e.name), path: childRel });
      }
    }
    return nodes;
  }
  return walk(root, "");
}

module.exports = { buildTree };
