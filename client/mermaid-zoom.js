/*!
 * mermaid-zoom.js — pan & zoom para diagramas Mermaid e SVGs avulsos (estilo mkdocs-material).
 *
 * Uso: depois de carregar o mermaid (ou em páginas com SVGs de diagrama),
 * inclua no <head> ou fim do <body>:
 *   <script src="assets/mermaid-zoom.js" defer></script>
 *
 * - Carrega sozinho a lib svg-pan-zoom (a mesma do mkdocs-material) via CDN.
 * - Clique no diagrama abre um lightbox: arraste = pan, scroll = zoom,
 *   botões + / − / ajustar / tela cheia. ESC ou clique fora fecha
 *   (ESC em tela cheia primeiro sai da tela cheia, depois fecha).
 * - O que vira zoomable:  <figure>  ·  .mermaid  ·  .panzoom / .diagram / .zoomable
 *     (qualquer SVG dentro desses contêineres, ou um <svg> com uma dessas classes).
 * - Nunca intercepta SVGs dentro de elementos interativos (button, a, [role=button],
 *   [onclick]) — o clique desses continua fazendo o que deveriam fazer.
 * - NÃO mexe no conteúdo dos elementos .mermaid (o Mermaid reescreve o próprio
 *   conteúdo após renderizar). Usa event delegation + pseudo-elemento CSS, que
 *   sobrevivem a qualquer reescrita de DOM. Por isso funciona mesmo se o
 *   Mermaid re-renderizar.
 * - Funciona abrindo o .html direto ou dentro do frame.
 */
(function () {
  "use strict";

  var CDN = "https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.2/dist/svg-pan-zoom.min.js";

  // contêineres que tornam um SVG interno "zoomable"; + svg direto com essas classes
  var WRAPPER = "figure, .mermaid, .panzoom, .diagram, .zoomable";
  // ancestrais cujo clique tem outro propósito — nunca seqüestrar
  var INTERACTIVE = "button, a, [role='button'], [onclick], label, summary";

  // ── helpers ──────────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.svgPanZoom) return resolve();
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("falha ao carregar " + src)); };
      document.head.appendChild(s);
    });
  }
  function libReady() { return new Promise(function (res) { loadScript(CDN).then(res, res); }); }

  function injectCSS() {
    if (document.getElementById("mz-style")) return;
    var css = [
      // cursor + ícone de expandir (pseudo-elemento → sobrevive a rewrites do mermaid)
      ".mermaid, figure, .panzoom, .diagram, .zoomable { position: relative; }",
      ".mermaid svg, .panzoom svg, .diagram svg, .zoomable svg, figure:has(svg) svg { cursor: zoom-in; }",
      ".mermaid::after, .panzoom::after, .diagram::after, .zoomable::after, figure:has(svg)::after {",
      "  content:'\\2197'; position:absolute; top:6px; right:8px; z-index:5;",
      "  pointer-events:none; font-size:1rem; line-height:1; color:#1f2329;",
      "  background:#fff; border:1px solid #d9dee6; border-radius:6px; padding:2px 7px;",
      "  opacity:0; transition:opacity .15s; box-shadow:0 1px 3px rgba(0,0,0,.12); }",
      ".mermaid:hover::after, .panzoom:hover::after, .diagram:hover::after, .zoomable:hover::after, figure:has(svg):hover::after { opacity:.9; }",
      // lightbox
      ".mz-overlay { position:fixed; inset:0; z-index:99990; background:rgba(15,20,30,.62);",
      "  display:flex; align-items:center; justify-content:center; padding:24px; }",
      ".mz-overlay[hidden] { display:none; }",
      ".mz-stage { position:relative; width:92vw; height:88vh; max-width:1500px;",
      "  background:#fff; border-radius:12px; overflow:hidden;",
      "  box-shadow:0 18px 60px rgba(0,0,0,.35); }",
      ".mz-stage svg { display:block; width:100% !important; height:100% !important; max-width:none !important; }",
      // tela cheia: stage ocupa a tela toda, sem moldura
      ".mz-stage:fullscreen { width:100vw; height:100vh; max-width:none; border-radius:0; }",
      ".mz-stage:-webkit-full-screen { width:100vw; height:100vh; max-width:none; border-radius:0; }",
      ".mz-close, .mz-fs, .mz-toolbar button { background:#fff; border:1px solid #d9dee6;",
      "  border-radius:7px; cursor:pointer; color:#1f2329; line-height:1;",
      "  box-shadow:0 1px 3px rgba(0,0,0,.12); }",
      ".mz-corner { position:absolute; top:12px; right:14px; z-index:6; display:flex; gap:6px; }",
      ".mz-close { width:34px; height:34px; font-size:1.2rem; }",
      ".mz-fs { width:34px; height:34px; font-size:1.05rem; }",
      ".mz-toolbar { position:absolute; bottom:12px; right:14px; z-index:6; display:flex; gap:6px; }",
      ".mz-toolbar button { width:36px; height:36px; font-size:1.05rem; }",
      ".mz-close:hover, .mz-fs:hover, .mz-toolbar button:hover { background:#f6f7f9; }",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "mz-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── resolver: dado o alvo do clique, acha o SVG zoomable (ou null) ────────
  function svgFromEvent(target) {
    if (!target || !target.closest) return null;
    if (target.closest(INTERACTIVE)) return null;          // não atrapalha botões/links
    var wrap = target.closest(WRAPPER);
    if (!wrap) return null;
    if (wrap.tagName.toLowerCase() === "svg") return wrap; // svg direto com classe opt-in
    return wrap.querySelector("svg");
  }

  // ── lightbox ─────────────────────────────────────────────────────────────
  var stage = null, clone = null, pz = null;

  function ensureOverlay() {
    if (document.getElementById("mz-overlay")) {
      stage = document.querySelector("#mz-overlay .mz-stage");
      return;
    }
    var o = document.createElement("div");
    o.className = "mz-overlay";
    o.id = "mz-overlay";
    o.hidden = true;
    o.innerHTML =
      '<div class="mz-stage">' +
      '<div class="mz-corner">' +
      '<button class="mz-fs" type="button" aria-label="Tela cheia" title="Tela cheia">&#x26F6;</button>' +
      '<button class="mz-close" type="button" aria-label="Fechar">&times;</button>' +
      '</div>' +
      '<div class="mz-toolbar">' +
      '<button type="button" data-z="in" title="Ampliar">+</button>' +
      '<button type="button" data-z="out" title="Reduzir">&minus;</button>' +
      '<button type="button" data-z="fit" title="Ajustar">&#x21BB;</button>' +
      "</div></div>";
    document.body.appendChild(o);
    stage = o.querySelector(".mz-stage");

    o.querySelector(".mz-close").addEventListener("click", closeModal);
    fsBtn = o.querySelector(".mz-fs");
    fsBtn.addEventListener("click", toggleFullscreen);
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
      document.addEventListener(ev, onFsChange);
    });
    o.addEventListener("mousedown", function (e) { if (e.target === o) closeModal(); });
    o.querySelector(".mz-toolbar").addEventListener("click", function (e) {
      var z = e.target.getAttribute("data-z");
      if (!z || !pz) return;
      if (z === "in") pz.zoomIn();
      else if (z === "out") pz.zoomOut();
      else { pz.resetZoom(); pz.center(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (fsElement()) return; // ESC em tela cheia: só sai da tela cheia, não fecha
      closeModal();
    });
  }

  // ── tela cheia ───────────────────────────────────────────────────────
  var fsBtn = null;
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function toggleFullscreen() {
    if (fsElement()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    } else {
      var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (req) req.call(stage); // sem Fullscreen API: segue no lightbox grande
    }
  }
  function onFsChange() {
    var fs = !!fsElement();
    if (fsBtn) {
      fsBtn.title = fs ? "Sair da tela cheia" : "Tela cheia";
      fsBtn.setAttribute("aria-label", fsBtn.title);
    }
    requestAnimationFrame(refit);
  }

  function openModal(srcSvg) {
    ensureOverlay();
    var o = document.getElementById("mz-overlay");
    var old = stage.querySelector("svg");
    if (old) old.remove();

    clone = srcSvg.cloneNode(true);
    clone.removeAttribute("style");
    clone.style.maxWidth = "none";
    stage.insertBefore(clone, stage.firstChild);

    o.hidden = false;
    document.body.style.overflow = "hidden";

    libReady().then(function () {
      if (!window.svgPanZoom) return;
      requestAnimationFrame(function () {
        var r = stage.getBoundingClientRect();
        clone.setAttribute("width", r.width);
        clone.setAttribute("height", r.height);
        try {
          pz = window.svgPanZoom(clone, {
            controlIconsEnabled: false,
            fit: true,
            center: true,
            minZoom: 0.2,
            maxZoom: 12,
            zoomScaleSlope: 0.3,
            preventMouseEventsDefault: true
          });
        } catch (err) {
          // SVG sem viewBox, por ex.: ainda mostra o diagrama grande, só sem pan/zoom.
          console.warn("mermaid-zoom: init falhou", err);
        }
      });
    });
  }

  function closeModal() {
    var o = document.getElementById("mz-overlay");
    if (!o || o.hidden) return;
    if (fsElement()) { // sai da tela cheia antes de esconder
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
    o.hidden = true;
    document.body.style.overflow = "";
    if (pz) { try { pz.destroy(); } catch (e) {} pz = null; }
    if (clone) { clone.remove(); clone = null; }
  }

  // redimensiona o pan/zoom quando o stage muda de tamanho (resize / tela cheia)
  function refit() {
    if (!pz || !stage || !clone) return;
    var r = stage.getBoundingClientRect();
    clone.setAttribute("width", r.width);
    clone.setAttribute("height", r.height);
    try { pz.resize(); pz.fit(); pz.center(); } catch (e) {}
  }
  window.addEventListener("resize", refit);

  // ── boot: event delegation (sobrevive a qualquer reescrita do Mermaid) ────
  injectCSS();
  function onClick(e) {
    var svg = svgFromEvent(e.target);
    if (svg) { e.preventDefault(); openModal(svg); }
  }
  if (document.body) document.addEventListener("click", onClick);
  else document.addEventListener("DOMContentLoaded", function () { document.addEventListener("click", onClick); });
})();
