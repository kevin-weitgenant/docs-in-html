// htmlovermd reload client — injected into every HTML while the dev server runs.
// Opens one SSE connection; reloads THIS page only when its own file (or a shared asset) changes.
(function () {
  if (window.top === window.self) console.log("[htmlovermd] hot reload connected");

  // Who am I? root "/" → "index.html", else the path with leading slashes stripped.
  var me = location.pathname.replace(/^\/+/, "") || "index.html";

  function shouldReload(changed) {
    if (changed === me) return true;             // my own file changed
    if (me === "index.html") return false;       // the shell only reacts to itself (keeps sidebar state)
    return /\.(?:js|mjs|css)$/i.test(changed);   // shared dev asset → reload the doc being viewed
  }

  var es = new EventSource("/__reload__");
  es.onmessage = function (e) {
    var changed;
    try { changed = JSON.parse(e.data).path; } catch (_) { return; }
    if (changed && shouldReload(changed)) location.reload();
  };
})();
