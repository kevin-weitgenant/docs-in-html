// `htmlovermd init [dir]` — scaffold a starter index.html (the shell) so you can customize it.

const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { SHELL } = require("./shell.ts") as typeof import("./shell");

function init(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const idx = path.join(dir, "index.html");
  if (fs.existsSync(idx)) {
    console.log("index.html already exists in " + dir + " — left untouched.");
    return;
  }
  fs.writeFileSync(idx, SHELL, "utf8");
  console.log("✓ Created " + idx);
  console.log("  Drop .html files in this folder, then run:  htmlovermd " + dir);
}

module.exports = { init };
