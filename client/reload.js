// docs-in-html reload client — injected into every HTML while the dev server runs.
// Opens one SSE connection; reloads THIS page only when its own file (or a shared asset) changes.
(function () {
  if (window.top === window.self) console.log("[docs-in-html] hot reload connected");

  // Who am I? The shell (a page with #docList) may also live at a deep URL
  // (/docs/foo.html) after F5 — identify it by structure, not by pathname.
  var isShell = !!document.getElementById("docList");
  var me = isShell ? "index.html" : location.pathname.replace(/^\/+/, "") || "index.html";

  function shouldReload(changed) {
    if (changed === me) return true;             // my own file changed
    if (me === "index.html") return false;       // the shell only reacts to itself (keeps sidebar state)
    return /\.(?:js|mjs|css)$/i.test(changed);   // shared dev asset → reload the doc being viewed
  }

  var es = new EventSource("/__reload__");
  es.onmessage = function (e) {
    var changed;
    try { changed = JSON.parse(e.data).path; } catch (_) { return; }
    // Re-broadcast every change as a window event so other clients in this page
    // (e.g. the sidebar) can react — even when this page itself won't reload.
    try { window.dispatchEvent(new CustomEvent("docs-in-html:change", { detail: { path: changed } })); } catch (_) {}
    if (changed && shouldReload(changed)) location.reload();
  };
})();
