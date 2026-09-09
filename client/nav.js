// docs-in-html nav client — builds the folder-tree sidebar from /__manifest__,
// handles doc switching + active highlighting + collapse memory, and manages
// files/folders from the sidebar: rename, move (drag & drop or "Move to…"),
// create folders, delete (docs + empty folders).
// Loaded only into the shell (a page with #docList). No-op otherwise,
// so the static <ul> fallback still works without the server.
(function () {
  var list = document.getElementById("docList");
  var iframe = document.querySelector("iframe");
  if (!list) return;

  // Fullscreen (ex.: botão tela cheia do mermaid-zoom) exige isto no iframe —
  // shells customizados costumam omitir, então garantimos aqui.
  if (iframe) { try { iframe.allowFullscreen = true; } catch (e) {} }

  if (!document.getElementById("dl-style")) {
    var css = document.createElement("style");
    css.id = "dl-style";
    css.textContent =
      ".dl-folder{position:relative;font-weight:600;padding:7px 8px;cursor:pointer;border-radius:6px;user-select:none;color:#1f2329}" +
      ".dl-folder:hover{background:#f6f7f9}" +
      "#docList .dl-nested{list-style:none;margin:2px 0 4px 8px;padding-left:14px;border-left:1px solid #eef1f5}" +
      "#docList a{display:block;position:relative;padding:7px 10px;border-radius:6px;text-decoration:none;color:#1f2329;cursor:pointer;font-size:.95rem;-webkit-user-drag:none;user-select:none}" +
      "#docList a:hover{background:#f6f7f9}" +
      "#docList a.active{background:#e8f0fe;color:#1f6feb;font-weight:600}" +
      "#dl-toggle{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid #d9dee6;background:#fff;border-radius:7px;cursor:pointer;font-size:14px;line-height:1;color:#1f2329}" +
      "#dl-toggle:hover{background:#f6f7f9}" +
      "#dl-toggle img{display:block;width:18px;height:18px}" +
      "#dl-toggle.dl-off{background:#e8f0fe;border-color:#1f6feb}" +
      "header #dl-toggle{margin-right:8px}" +
      "#dl-toggle.dl-floating{position:fixed;top:10px;left:10px;z-index:200;box-shadow:0 1px 3px rgba(0,0,0,.12)}" +
      "aside.dl-collapsed{display:none!important}" +
      "#docList li{position:relative}" +
      // kebab button (revealed on hover, like the old delete button)
      ".dl-act{position:absolute;right:4px;top:50%;transform:translateY(-50%);display:none;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;background:transparent;border-radius:5px;cursor:pointer;color:#9aa4b2;font-size:15px;font-weight:700;line-height:1}" +
      ".dl-act:hover{background:#e9edf3;color:#1f2329}" +
      "#docList .dl-folder:hover>.dl-act,#docList a:hover>.dl-act,#docList .dl-act:hover,#docList .dl-act:focus-visible{display:inline-flex}" +
      // ⋯ dropdown menu
      ".dl-menu{position:fixed;z-index:400;min-width:160px;background:#fff;border:1px solid #d9dee6;border-radius:9px;box-shadow:0 4px 14px rgba(0,0,0,.14);padding:4px;font-size:.9rem}" +
      ".dl-menu button{display:block;width:100%;text-align:left;padding:7px 12px;border:none;background:transparent;border-radius:6px;cursor:pointer;color:#1f2329;font:inherit}" +
      ".dl-menu button:hover{background:#f6f7f9}" +
      ".dl-menu button.dl-danger{color:#cf222e}" +
      ".dl-menu button.dl-danger:hover{background:#ffebe9}" +
      ".dl-menu button.dl-armed{background:#ffebe9;color:#cf222e;font-weight:700}" +
      // inline edit (rename / new folder)
      ".dl-edit input{width:100%;padding:4px 8px;border:1px solid #1f6feb;border-radius:6px;font:inherit;color:#1f2329;background:#fff;outline:none}" +
      ".dl-edit input.dl-bad{border-color:#cf222e;background:#fff1f0}" +
      ".dl-ext{font-size:.8em;color:#5b6472;margin-left:4px}" +
      // ghost that follows the cursor during a drag
      ".dl-ghost{position:fixed;z-index:500;pointer-events:none;background:#fff;border:1px solid #1f6feb;border-radius:8px;padding:6px 12px;box-shadow:0 6px 18px rgba(0,0,0,.2);font-size:.9rem;color:#1f6feb;font-weight:600;opacity:.95;white-space:nowrap}" +
      "body.dl-grabbing,body.dl-grabbing *{cursor:grabbing!important}" +
      // drag & drop
      "#docList .dl-drop{background:#e8f0fe !important;outline:2px dashed #1f6feb;outline-offset:-2px;border-radius:6px}" +
      "#docList li.dl-ins::before{content:\"\";position:absolute;left:6px;right:6px;top:-3px;height:0;border-top:2px solid #1f6feb;pointer-events:none}" +
      "#docList li.dl-dragging{opacity:.35}" +
      ".dl-newbar{display:flex;align-items:center;justify-content:space-between;padding:2px 6px 10px;border-bottom:1px solid #eef1f5;margin-bottom:8px}" +
      ".dl-newbar span{font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9aa4b2}" +
      ".dl-newbar button{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border:1px solid #d9dee6;background:#fff;border-radius:7px;cursor:pointer;font-size:.82rem;color:#1f2329}" +
      ".dl-newbar button:hover{background:#f6f7f9}" +
      ".dl-newbar.dl-drop{background:#e8f0fe;outline:2px dashed #1f6feb;outline-offset:-2px;border-radius:6px}" +
      ".dl-newbar.dl-root-hint span::after{content:\"  ← solte para mover pra raiz\";color:#1f6feb;font-weight:700;text-transform:none;letter-spacing:0;font-size:.8rem}" +
      // move-to popover
      ".dl-pop{position:fixed;z-index:400;min-width:200px;max-height:260px;overflow-y:auto;background:#fff;border:1px solid #d9dee6;border-radius:9px;box-shadow:0 4px 14px rgba(0,0,0,.14);padding:4px;font-size:.9rem}" +
      ".dl-pop button{display:block;width:100%;text-align:left;padding:6px 12px;border:none;background:transparent;border-radius:6px;cursor:pointer;color:#1f2329;font:inherit;white-space:nowrap}" +
      ".dl-pop button:hover{background:#f6f7f9}" +
      ".dl-pop button.dl-cur{color:#1f6feb;font-weight:600}" +
      // toast
      ".dl-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:500;max-width:80vw;padding:10px 18px;border-radius:9px;background:#1f2329;color:#fff;font-size:.9rem;box-shadow:0 4px 14px rgba(0,0,0,.25)}" +
      ".dl-toast.dl-err{background:#cf222e}";
    document.head.appendChild(css);
  }

  // ── small utilities ─────────────────────────────────────────────────────
  function basename(p) { return p.split("/").pop(); }
  function dirname(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }
  function validName(name, isFolder) {
    if (typeof name !== "string") return false;
    var n = name.trim();
    if (!n || /[\\/:*?"<>|\x00-\x1f]/.test(n)) return false;
    if (n.startsWith(".") || n.startsWith("_")) return false;
    if (!isFolder && n.toLowerCase() === "index") return false; // index.html is the shell
    return n;
  }
  function api(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 409 ? "A file or folder with that name already exists" : "request failed (" + r.status + ")");
      return r.text();
    });
  }
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = document.querySelector(".dl-toast");
    if (!t) { t = document.createElement("div"); t.className = "dl-toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle("dl-err", !!isErr);
    t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = "none"; }, 4000);
  }

  var ROOT_INFO = { root: "", sep: "/" }; // absolute path of the served folder + OS separator
  function fetchManifest(cb) {
    fetch("/__manifest__", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && Array.isArray(data.tree)) ROOT_INFO = { root: data.root || "", sep: data.sep || "/" };
        cb(data && Array.isArray(data.tree) ? data.tree : data); // old shape: bare array
      })
      .catch(function () {});
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(okMsg); } catch (e) { toast("Could not copy", true); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  // ── ⋯ dropdown menu ──────────────────────────────────────────────────────
  var openMenu = null;
  function closeMenu() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    // drop focus from the kebab button so it doesn't stay visible on other rows
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("dl-act")) ae.blur();
  }
  document.addEventListener("click", function (e) {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  // The iframe covers most of the page — clicks and ESC there never bubble up to
  // the shell's document. Close the menu when focus moves into it, and hook the
  // iframe's own keydown after every load (the doc is swapped on navigation).
  window.addEventListener("blur", function () { closeMenu(); });
  if (iframe) iframe.addEventListener("load", function () {
    try { iframe.contentDocument.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); }); }
    catch (e) {} // cross-origin doc: the blur hook above still covers it
  });
  function showMenu(anchor, items) {
    closeMenu();
    var m = document.createElement("div");
    m.className = "dl-menu";
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = it.label;
      if (it.danger) b.className = "dl-danger";
      if (it.armed) { // two-click confirm (delete)
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!b.classList.contains("dl-armed")) {
            b.classList.add("dl-armed");
            b.textContent = "Delete for sure?";
            setTimeout(function () {
              if (b.isConnected) { b.classList.remove("dl-armed"); b.textContent = it.label; }
            }, 3000);
            return;
          }
          closeMenu();
          it.onClick();
        });
      } else {
        b.addEventListener("click", function (e) { e.stopPropagation(); closeMenu(); it.onClick(); });
      }
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    var mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8)) + "px";
    m.style.top = (r.bottom + mh > window.innerHeight - 8 ? Math.max(8, r.top - mh) : r.bottom + 4) + "px";
    openMenu = m;
  }
  function makeKebab(entry) { // entry: {path, isFolder, labelEl}
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dl-act";
    btn.title = "More actions";
    btn.setAttribute("aria-label", "Actions for " + entry.path);
    btn.textContent = "\u22ef"; // ⋯
    btn.addEventListener("dblclick", function (e) { e.stopPropagation(); });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (openMenu) { closeMenu(); return; }
      showMenu(btn, [
        { label: "\u29c9  Copy path", onClick: function () {
            copyText(entry.path, "Copied: " + entry.path);
          } },
        { label: "\u29c9  Copy full path", onClick: function () {
            var abs = ROOT_INFO.root ? ROOT_INFO.root.replace(/[\\/]+$/, "") + ROOT_INFO.sep + entry.path.split("/").join(ROOT_INFO.sep) : entry.path;
            copyText(abs, "Copied: " + abs);
          } },
        { label: "\u21c4  Move to\u2026", onClick: function () { showMovePopover(btn, entry); } },
        { label: "\u2715  Delete", danger: true, armed: true, onClick: function () { doDelete(entry); } }
      ]);
    });
    return btn;
  }

  // ── inline edit (rename / new folder) ────────────────────────────────────
  // target: the element whose text becomes the input (a / .dl-folder div)
  // ext: fixed suffix shown next to the input (".html") or "" for folders
  function startEdit(target, initial, ext, onConfirm) {
    var li = target.closest ? target.closest("li") : null;
    if (li) li.classList.add("dl-editing");
    var original = target.textContent;
    target.classList.add("dl-edit");
    target.textContent = "";
    var input = document.createElement("input");
    input.type = "text";
    input.value = initial;
    target.appendChild(input);
    if (ext) {
      var s = document.createElement("span");
      s.className = "dl-ext";
      s.textContent = ext;
      target.appendChild(s);
    }
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    var done = false;
    function finish(value) {
      if (done) return;
      done = true;
      target.classList.remove("dl-edit");
      target.textContent = original; // the manifest refresh will render the truth
      if (li) li.classList.remove("dl-editing");
      if (value != null) onConfirm(value);
    }
    input.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter") finish(input.value);
      else if (e.key === "Escape") finish(null);
    });
    input.addEventListener("blur", function () { setTimeout(function () { finish(input.value); }, 0); });
    input.addEventListener("click", function (e) { e.stopPropagation(); });
    return input;
  }

  // ── rename ───────────────────────────────────────────────────────────────
  function startRename(entry) {
    var raw = basename(entry.path);           // raw filename, not the humanized label
    var ext = entry.isFolder ? "" : (raw.match(/\.html?$/i) || [""])[0];
    var stem = ext ? raw.slice(0, -ext.length) : raw;
    var input = startEdit(entry.labelEl, stem, ext, function (name) {
      var n = validName(name, entry.isFolder);
      if (!n) { toast("Invalid name", true); return; }
      var dir = dirname(entry.path);
      var to = (dir ? dir + "/" : "") + n + ext;
      if (to === entry.path) return;
      api("/__rename__", { from: entry.path, to: to }).then(function () {
        afterPathChange(entry.path, to);
        refresh();
      }).catch(function (err) { toast("Rename failed: " + err.message, true); });
    });
    // mark bad input live
    input.addEventListener("input", function () {
      input.classList.toggle("dl-bad", !validName(input.value, entry.isFolder));
    });
  }

  // ── delete ───────────────────────────────────────────────────────────────
  function doDelete(entry) {
    api("/__delete__", { path: entry.path }).then(function () {
      var cur = location.pathname.replace(/^\/+/, "");
      if (cur === entry.path || cur.startsWith(entry.path + "/")) {
        fetchManifest(function (tree) {
          var f = firstDoc(tree);
          if (f) go(f, false);
        });
      }
      refresh();
    }).catch(function (err) {
      toast(entry.isFolder ? "Folder is not empty — move its files out first" : "Delete failed: " + err.message, true);
    });
  }

  // ── move (popover + drag & drop) ────────────────────────────────────────
  function collectFolders(nodes, skipPath, out, depth) {
    out = out || []; depth = depth || 0;
    (nodes || []).forEach(function (n) {
      if (n.type !== "folder") return;
      if (skipPath && (n.path === skipPath || skipPath.startsWith(n.path + "/"))) return; // self / descendants
      out.push({ path: n.path, name: n.name, depth: depth });
      collectFolders(n.children, skipPath, out, depth + 1);
    });
    return out;
  }
  function showMovePopover(anchor, entry) {
    var curDir = dirname(entry.path);
    var targets = [{ path: "", name: "(root)", depth: -1 }].concat(collectFolders(currentTree, entry.path));
    var pop = document.createElement("div");
    pop.className = "dl-pop";
    targets.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = new Array(Math.max(0, t.depth) + 1).join("\u00a0\u00a0") + (t.depth >= 0 ? "\u25b8 " : "") + t.name;
      if (t.path === curDir) b.classList.add("dl-cur");
      b.addEventListener("click", function () {
        removePop();
        moveTo(entry, t.path);
      });
      pop.appendChild(b);
    });
    function removePop() { pop.remove(); document.removeEventListener("click", outside, true); window.removeEventListener("blur", removePop); }
    function outside(e) { if (!pop.contains(e.target)) removePop(); }
    document.addEventListener("click", outside, true);
    window.addEventListener("blur", removePop); // click moved into the iframe
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8)) + "px";
    pop.style.top = (r.bottom + ph > window.innerHeight - 8 ? Math.max(8, r.top - ph) : r.bottom + 4) + "px";
  }
  function moveTo(entry, destDir) {
    var to = (destDir ? destDir + "/" : "") + basename(entry.path);
    if (to === entry.path) return; // already there
    api("/__rename__", { from: entry.path, to: to }).then(function () {
      afterPathChange(entry.path, to);
      refresh();
    }).catch(function (err) { toast("Move failed: " + err.message, true); });
  }

  // If the currently displayed doc was renamed/moved (or lived inside a moved
  // folder), update the iframe + address bar so nothing 404s on reload.
  function afterPathChange(from, to) {
    var cur = location.pathname.replace(/^\/+/, "");
    if (cur === from || cur.startsWith(from + "/")) {
      go(to + cur.slice(from.length), false);
    }
  }

  // ── drag & drop (pointer-based: a "ghost" of the row follows the cursor,
  // folders light up as targets, collapsed folders auto-expand on hover) ──
  var drag = null; // {entry, li, ghost, startX, startY, active, target, openTimer}
  function canDrop(t) {
    if (!drag || !t) return false;
    if (t.kind === "folder") {
      if (t.path === drag.entry.path) return false;
      if (drag.entry.isFolder && t.path.startsWith(drag.entry.path + "/")) return false; // folder into itself
      return dirname(drag.entry.path) !== t.path; // no-op move → refuse
    }
    if (t.kind === "root") return dirname(drag.entry.path) !== "";
    return true; // file target = reorder (and/or move) before that file
  }
  function clearDropHints() {
    var els = document.querySelectorAll(".dl-drop, .dl-ins");
    for (var i = 0; i < els.length; i++) els[i].classList.remove("dl-drop", "dl-ins");
  }
  function setDropTarget(t) {
    if (drag.target && t && drag.target.kind === t.kind && drag.target.path === t.path && drag.target.li === t.li) return;
    clearDropHints();
    if (drag.openTimer) { clearTimeout(drag.openTimer); drag.openTimer = null; }
    drag.target = t;
    if (!t) return;
    if (t.kind === "folder") {
      t.el.classList.add("dl-drop");
      drag.openTimer = setTimeout(function () { expandFolder(t.path); }, 600);
    } else if (t.kind === "file") {
      t.el.classList.add("dl-ins"); // blue insertion line above the row
    } else {
      t.el.classList.add("dl-drop"); // the panel itself → root
    }
  }
  function onDragMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) < 5 && Math.abs(e.clientY - drag.startY) < 5) return;
      drag.active = true;
      if (newbarEl && canDrop({ kind: "root", path: "" })) newbarEl.classList.add("dl-root-hint");
      drag.ghost = document.createElement("div");
      drag.ghost.className = "dl-ghost";
      drag.ghost.textContent = (drag.entry.isFolder ? "\ud83d\udcc1 " : "\ud83d\udcc4 ") + basename(drag.entry.path);
      document.body.appendChild(drag.ghost);
      drag.li.classList.add("dl-dragging");
      document.body.classList.add("dl-grabbing");
    }
    drag.ghost.style.left = (e.clientX + 14) + "px";
    drag.ghost.style.top = (e.clientY + 12) + "px";
    drag.ghost.style.display = "none";
    var el = document.elementFromPoint(e.clientX, e.clientY);
    drag.ghost.style.display = "";
    var t = null;
    if (el && !drag.li.contains(el)) {
      var li = el.closest ? el.closest("#docList li") : null;
      if (li && li !== drag.li) {
        var head = li.querySelector(":scope > .dl-folder");
        if (head) {
          t = { kind: "folder", path: head.dataset.path, el: head, li: li }; // drop into the folder
        } else {
          var a = li.querySelector(":scope > a");
          if (a) t = { kind: "file", path: a.dataset.path, el: li, li: li }; // reorder before this file
        }
      }
    }
    if (!t && el && navAside && navAside.contains(el) && !drag.li.contains(el)) {
      t = { kind: "root", path: "", el: (newbarEl && newbarEl.contains(el)) ? newbarEl : list, li: null }; // empty space / new-folder bar → root
    }
    if (t && !canDrop(t)) t = null;
    setDropTarget(t);
  }
  function onDragUp() {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragUp);
    var d = drag; drag = null;
    if (!d) return;
    if (d.openTimer) clearTimeout(d.openTimer);
    if (d.ghost) d.ghost.remove();
    d.li.classList.remove("dl-dragging");
    document.body.classList.remove("dl-grabbing");
    if (newbarEl) newbarEl.classList.remove("dl-root-hint");
    clearDropHints();
    if (d.active && d.target) {
      if (d.target.kind === "file") doReorder(d.entry, d.target);
      else moveTo(d.entry, d.target.path);
    }
  }
  // Drop on a file row = "insert before it" (reorder inside the same folder,
  // or move to that folder + reorder when coming from elsewhere).
  function doReorder(entry, target) {
    var dir = dirname(target.path);
    var names = [];
    var lis = target.li.parentElement.querySelectorAll(":scope > li");
    for (var i = 0; i < lis.length; i++) {
      var a = lis[i].querySelector(":scope > a");
      var h = lis[i].querySelector(":scope > .dl-folder");
      if (a) names.push(basename(a.dataset.path));
      else if (h) names.push(basename(h.dataset.path));
    }
    var dragName = basename(entry.path);
    names = names.filter(function (n) { return n !== dragName; });
    var idx = names.indexOf(basename(target.path));
    if (idx < 0) idx = names.length;
    names.splice(idx, 0, dragName);
    var from = entry.path;
    var to = (dir ? dir + "/" : "") + dragName;
    var step = from === to ? Promise.resolve() : api("/__rename__", { from: from, to: to });
    step.then(function () {
      return api("/__order__", { folder: dir, order: names });
    }).then(function () {
      afterPathChange(from, to);
      refresh();
    }).catch(function (err) { toast("Reorder failed: " + err.message, true); });
  }
  function enableDrag(li, entry) {
    li.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest("button, input, .dl-edit")) return;
      if (li.classList.contains("dl-editing")) return;
      e.stopPropagation(); // the innermost row (file) wins — don't let ancestor folders hijack
      drag = { entry: entry, li: li, startX: e.clientX, startY: e.clientY, active: false, target: null, openTimer: null };
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragUp);
      e.preventDefault(); // no text selection while dragging
    });
  }
  function expandFolder(p) {
    if (isOpen(p)) return;
    collapsed[p] = false; save();
    var heads = list.querySelectorAll(".dl-folder");
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].dataset.path === p) {
        var lbl = heads[i].querySelector(":scope > .dl-label");
        if (lbl) lbl.textContent = chevron(p) + "  " + heads[i].dataset.name;
        var ul = heads[i].parentElement.querySelector(":scope > .dl-nested");
        if (ul) ul.style.display = "";
        break;
      }
    }
  }

  // ── tree rendering ───────────────────────────────────────────────────────
  var collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem("docs-in-html:collapsed") || "{}"); } catch (e) { collapsed = {}; }
  function save() { try { localStorage.setItem("docs-in-html:collapsed", JSON.stringify(collapsed)); } catch (e) {} }
  function isOpen(p) { return !collapsed[p]; }
  function chevron(p) { return isOpen(p) ? "▾" : "▸"; }

  function renderNode(n) {
    if (n.type === "folder") {
      var li = document.createElement("li");
      var head = document.createElement("div");
      head.className = "dl-folder";
      head.dataset.path = n.path;
      head.dataset.name = n.name;
      var label = document.createElement("span");
      label.className = "dl-label";
      label.textContent = chevron(n.path) + "  " + n.name;
      head.appendChild(label);
      var entry = { path: n.path, isFolder: true, labelEl: label };
      head.addEventListener("click", function (e) {
        if (head.classList.contains("dl-edit")) return; // renaming
        collapsed[n.path] = isOpen(n.path); // toggle
        save();
        label.textContent = chevron(n.path) + "  " + head.dataset.name;
        var ul = li.querySelector(":scope > .dl-nested");
        if (ul) ul.style.display = isOpen(n.path) ? "" : "none";
      });
      // double-click a folder name → rename it (desktop convention)
      head.addEventListener("dblclick", function (e) {
        e.preventDefault();
        if (!head.classList.contains("dl-edit")) startRename(entry);
      });
      li.appendChild(head);
      head.appendChild(makeKebab(entry));
      enableDrag(li, entry);
      if (n.children && n.children.length) {
        var ul = document.createElement("ul");
        ul.className = "dl-nested";
        ul.style.display = isOpen(n.path) ? "" : "none";
        n.children.forEach(function (c) { ul.appendChild(renderNode(c)); });
        li.appendChild(ul);
      }
      return li;
    }
    var li2 = document.createElement("li");
    var a = document.createElement("a");
    a.href = "/" + n.path;
    a.setAttribute("draggable", "false"); // links drag natively — kills our mousemove drag
    a.dataset.path = n.path;
    a.textContent = n.name;
    var entry2 = { path: n.path, isFolder: false, labelEl: a };
    a.addEventListener("click", function (e) {
      if (a.classList.contains("dl-edit")) return; // renaming
      e.preventDefault(); go(n.path);
    });
    // double-click a file name → rename it (desktop convention)
    a.addEventListener("dblclick", function (e) {
      e.preventDefault();
      if (!a.classList.contains("dl-edit")) startRename(entry2);
    });
    li2.appendChild(a);
    a.appendChild(makeKebab(entry2));
    enableDrag(li2, entry2);
    return li2;
  }

  // ── "＋ Folder" toolbar at the top of the side panel ─────────────────────
  var navAside = list.closest("aside") || list.parentElement;
  var newbarEl = null;
  if (navAside && !navAside.querySelector(".dl-newbar")) {
    var bar = document.createElement("div");
    bar.className = "dl-newbar";
    var label = document.createElement("span");
    label.textContent = "Folders";
    var newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.title = "Create a new folder at the top level";
    newBtn.textContent = "\uff0b Folder";
    newBtn.addEventListener("click", function () { createFolder(); });
    bar.appendChild(label);
    bar.appendChild(newBtn);
    newbarEl = bar;
    navAside.insertBefore(bar, list);
  }

  function createFolder() {
    // optimistic inline-edit row at the top of the tree; mkdir only on confirm
    var li = document.createElement("li");
    var head = document.createElement("div");
    head.className = "dl-folder";
    head.textContent = "New folder";
    li.appendChild(head);
    list.insertBefore(li, list.firstChild);
    startEdit(head, "New folder", "", function (name) {
      li.remove();
      var n = validName(name, true);
      if (!n) { toast("Invalid folder name", true); return; }
      api("/__mkdir__", { path: n }).then(function () {
        refresh();
      }).catch(function (err) { toast("Could not create folder: " + err.message, true); });
    });
  }

  // ── sidebar collapse toggle (whole panel) ────────────────────────────────
  var toggle = document.createElement("button");
  toggle.id = "dl-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle sidebar");
  var icon = document.createElement("img");
  icon.src = "/__docs__/sidebar-left.svg";
  icon.alt = "";
  icon.width = 18;
  icon.height = 18;
  toggle.appendChild(icon);
  function renderToggle() {
    var hidden = navAside && navAside.classList.contains("dl-collapsed");
    toggle.title = hidden ? "Show sidebar" : "Hide sidebar";
    toggle.setAttribute("aria-pressed", String(!!hidden));
    toggle.classList.toggle("dl-off", !!hidden);
  }
  function setSidebar(hidden) {
    if (!navAside) return;
    navAside.classList.toggle("dl-collapsed", hidden);
    try { localStorage.setItem("docs-in-html:sidebar", hidden ? "1" : "0"); } catch (e) {}
    renderToggle();
  }
  var startHidden = false;
  try { startHidden = localStorage.getItem("docs-in-html:sidebar") === "1"; } catch (e) {}
  var header = document.querySelector("header");
  if (header) header.insertBefore(toggle, header.firstChild); // left-aligned, first item in the header
  else { toggle.className = "dl-floating"; document.body.appendChild(toggle); }
  toggle.addEventListener("click", function () {
    setSidebar(!(navAside && navAside.classList.contains("dl-collapsed")));
  });
  setSidebar(startHidden);

  function build(nodes) {
    var frag = document.createDocumentFragment();
    nodes.forEach(function (n) { frag.appendChild(renderNode(n)); });
    list.innerHTML = "";
    list.appendChild(frag);
  }

  var skipSyncPush = false; // suppress URL push when go() itself caused the iframe load
  function go(path, push) {
    skipSyncPush = true;
    if (iframe) iframe.src = "/" + path;
    setActive(path);
    try {
      if (push === false) history.replaceState({ docsPath: path }, "", "/" + path);
      else history.pushState({ docsPath: path }, "", "/" + path);
    } catch (e) {}
  }

  function setActive(path) {
    var links = list.querySelectorAll("a");
    var found = null;
    for (var i = 0; i < links.length; i++) {
      if (links[i].dataset.path === path) { links[i].classList.add("active"); found = links[i]; }
      else links[i].classList.remove("active");
    }
    if (!found) return;
    // expand every ancestor folder
    var node = found;
    while (node && node !== list) {
      var head = node.querySelector(":scope > .dl-folder");
      if (head) {
        var fp = head.dataset.path;
        if (!isOpen(fp)) {
          collapsed[fp] = false; save();
          var lbl2 = head.querySelector(":scope > .dl-label");
          if (lbl2) lbl2.textContent = chevron(fp) + "  " + head.dataset.name;
          var ul = node.querySelector(":scope > .dl-nested");
          if (ul) ul.style.display = "";
        }
      }
      node = node.parentElement;
    }
  }

  function syncFromIframe() {
    try {
      var href = iframe.contentWindow.location.href;
      if (!href || href === "about:blank") return; // iframe not loaded yet
      var p = iframe.contentWindow.location.pathname.replace(/^\/+/, "");
      if (!p) return;
      setActive(p);
      // the doc navigated itself (link inside the iframe) → keep the URL in sync
      if (!skipSyncPush && "/" + p !== location.pathname) {
        try { history.pushState({ docsPath: p }, "", "/" + p); } catch (e) {}
      }
      skipSyncPush = false;
    } catch (e) {}
  }

  function firstDoc(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === "doc") return nodes[i].path;
      if (nodes[i].type === "folder") { var f = firstDoc(nodes[i].children || []); if (f) return f; }
    }
    return null;
  }

  // Keep the sidebar in sync as files/folders are added, removed, or renamed.
  // We re-fetch the manifest on every change but only rebuild the DOM when the
  // set of entries actually changed — so ordinary content edits don't wipe your
  // collapse state / scroll position / active doc.
  var currentSignature = null;
  var currentTree = null;
  function signature(nodes) {
    var out = [];
    (function walk(arr) {
      (arr || []).forEach(function (n) {
        out.push((n.type === "folder" ? "d:" : "f:") + n.path);
        if (n.type === "folder") walk(n.children);
      });
    })(nodes);
    return out.join("|");
  }
  function applyTree(tree) {
    if (!tree) return;
    var sig = signature(tree);
    if (sig === currentSignature) return;       // only content changed → keep sidebar state
    currentSignature = sig;
    currentTree = tree;
    var scroller = navAside || list;
    var scrollTop = scroller.scrollTop;
    build(tree);
    if (iframe && !iframe.getAttribute("src")) {
      // deep link: if the current URL points at a doc in the tree, open it
      var initial = location.pathname.replace(/^\/+/, "");
      var f = null;
      if (initial) {
        var links = list.querySelectorAll("a");
        for (var i = 0; i < links.length; i++) {
          if (links[i].dataset.path === initial) { f = initial; break; }
        }
      }
      if (!f) f = firstDoc(tree);
      if (f) go(f, false);
    }
    syncFromIframe();
    scroller.scrollTop = scrollTop;             // preserve sidebar scroll across rebuild
  }

  function refresh() {
    fetchManifest(applyTree);
  }
  refresh();

  // reload.js (also injected into the shell) re-broadcasts each file change here.
  if (typeof window.CustomEvent === "function") {
    window.addEventListener("docs-in-html:change", refresh);
  }

  if (iframe) iframe.addEventListener("load", syncFromIframe);

  // back/forward buttons
  window.addEventListener("popstate", function (e) {
    var p = (e.state && e.state.docsPath) || location.pathname.replace(/^\/+/, "");
    if (p && iframe) go(p, false);
  });
})();
