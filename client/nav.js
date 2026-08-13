// docsinhtml nav client — builds the folder-tree sidebar from /__manifest__,
// handles doc switching + active highlighting + collapse memory.
// Loaded only into the shell (a page with #docList). No-op otherwise,
// so the static <ul> fallback still works without the server.
(function () {
  var list = document.getElementById("docList");
  var iframe = document.querySelector("iframe");
  if (!list) return;

  if (!document.getElementById("dl-style")) {
    var css = document.createElement("style");
    css.id = "dl-style";
    css.textContent =
      ".dl-folder{font-weight:600;padding:7px 8px;cursor:pointer;border-radius:6px;user-select:none;color:#1f2329}" +
      ".dl-folder:hover{background:#f6f7f9}" +
      "#docList .dl-nested{list-style:none;margin:2px 0 4px 8px;padding-left:14px;border-left:1px solid #eef1f5}" +
      "#docList a{display:block;padding:7px 10px;border-radius:6px;text-decoration:none;color:#1f2329;cursor:pointer;font-size:.95rem}" +
      "#docList a:hover{background:#f6f7f9}" +
      "#docList a.active{background:#e8f0fe;color:#1f6feb;font-weight:600}" +
      "#dl-toggle{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid #d9dee6;background:#fff;border-radius:7px;cursor:pointer;font-size:14px;line-height:1;color:#1f2329}" +
      "#dl-toggle:hover{background:#f6f7f9}" +
      "header #dl-toggle{margin-left:auto}" +
      "#dl-toggle.dl-floating{position:fixed;top:10px;left:10px;z-index:200;box-shadow:0 1px 3px rgba(0,0,0,.12)}" +
      "aside.nav.dl-collapsed{display:none!important}";
    document.head.appendChild(css);
  }

  // Collapse / hide the whole sidebar (button in the header; state remembered).
  var navAside = list.closest("aside");
  var toggle = document.createElement("button");
  toggle.id = "dl-toggle";
  toggle.type = "button";
  function renderToggle() {
    var hidden = navAside && navAside.classList.contains("dl-collapsed");
    toggle.textContent = hidden ? "\u2630" : "\u25C2";   // ☰ when hidden, ◂ when shown
    toggle.title = hidden ? "Show sidebar" : "Hide sidebar";
  }
  function setSidebar(hidden) {
    if (!navAside) return;
    navAside.classList.toggle("dl-collapsed", hidden);
    try { localStorage.setItem("docsinhtml:sidebar", hidden ? "1" : "0"); } catch (e) {}
    renderToggle();
  }
  var startHidden = false;
  try { startHidden = localStorage.getItem("docsinhtml:sidebar") === "1"; } catch (e) {}
  var header = document.querySelector("header");
  if (header) header.appendChild(toggle);
  else { toggle.className = "dl-floating"; document.body.appendChild(toggle); }
  toggle.addEventListener("click", function () {
    setSidebar(!(navAside && navAside.classList.contains("dl-collapsed")));
  });
  setSidebar(startHidden);

  var STORE = "docsinhtml:collapsed";
  var collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { collapsed = {}; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(collapsed)); } catch (e) {} }
  function isOpen(p) { return !collapsed[p]; }
  function chevron(p) { return isOpen(p) ? "▾" : "▸"; }

  function renderNode(n) {
    if (n.type === "folder") {
      var li = document.createElement("li");
      var head = document.createElement("div");
      head.className = "dl-folder";
      head.dataset.path = n.path;
      head.dataset.name = n.name;
      head.textContent = chevron(n.path) + "  " + n.name;
      head.addEventListener("click", function () {
        collapsed[n.path] = isOpen(n.path); // toggle
        save();
        head.textContent = chevron(n.path) + "  " + head.dataset.name;
        var ul = li.querySelector(":scope > .dl-nested");
        if (ul) ul.style.display = isOpen(n.path) ? "" : "none";
      });
      li.appendChild(head);
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
    a.dataset.path = n.path;
    a.textContent = n.name;
    a.addEventListener("click", function (e) { e.preventDefault(); go(n.path); });
    li2.appendChild(a);
    return li2;
  }

  function build(nodes) {
    var frag = document.createDocumentFragment();
    nodes.forEach(function (n) { frag.appendChild(renderNode(n)); });
    list.innerHTML = "";
    list.appendChild(frag);
  }

  function go(path) {
    if (iframe) iframe.src = "/" + path;
    setActive(path);
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
          head.textContent = chevron(fp) + "  " + head.dataset.name;
          var ul = node.querySelector(":scope > .dl-nested");
          if (ul) ul.style.display = "";
        }
      }
      node = node.parentElement;
    }
  }

  function syncFromIframe() {
    try {
      var p = iframe.contentWindow.location.pathname.replace(/^\/+/, "");
      if (p) setActive(p);
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
    var scroller = navAside || list;
    var scrollTop = scroller.scrollTop;
    build(tree);
    if (iframe && !iframe.getAttribute("src")) { var f = firstDoc(tree); if (f) go(f); }
    syncFromIframe();
    scroller.scrollTop = scrollTop;             // preserve sidebar scroll across rebuild
  }

  function refresh() {
    fetch("/__manifest__", { cache: "no-store" }).then(function (r) { return r.json(); }).then(applyTree).catch(function () {});
  }
  refresh();

  // reload.js (also injected into the shell) re-broadcasts each file change here.
  if (typeof window.CustomEvent === "function") {
    window.addEventListener("docsinhtml:change", refresh);
  }

  if (iframe) iframe.addEventListener("load", syncFromIframe);
})();
