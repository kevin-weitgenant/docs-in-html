// Live reload: SSE channel (/__reload__) + recursive file watcher.
// createReload(root) → { handle, close }. handle() claims the SSE route.

import type { IncomingMessage, ServerResponse } from "node:http";
const fs = require("node:fs") as typeof import("node:fs");

interface ReloadFeature {
  handle(req: IncomingMessage, res: ServerResponse): boolean; // true if this was the SSE route
  close(): void;
}

function createReload(root: string): ReloadFeature {
  const clients: Set<ServerResponse> = new Set();

  function broadcast(relPath: string): void {
    if (!clients.size) return;
    const msg = `data: ${JSON.stringify({ path: relPath })}\n\n`;
    for (const res of clients) res.write(msg);
  }

  // Debounce per file: Windows fires several events for one save.
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(root, { recursive: true }, (_e, file) => {
      if (!file) return;
      const rel = file.split(/[\\/]/).join("/"); // normalize separators
      clearTimeout(timers[rel]);
      timers[rel] = setTimeout(() => { delete timers[rel]; broadcast(rel); }, 150);
    });
    watcher.on("error", () => {});
  } catch {
    console.warn("[htmlovermd] fs.watch unavailable — hot reload disabled (static serving still works).");
  }

  return {
    handle(req, res) {
      if ((req.url || "").split("?")[0] !== "/__reload__") return false;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      clients.add(res);
      req.on("close", () => { clients.delete(res); });
      return true;
    },
    close() {
      if (watcher) watcher.close();
      for (const res of clients) res.end();
      clients.clear();
    },
  };
}

module.exports = { createReload };
