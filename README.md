# docs-in-html

Navigate folders of **HTML docs** with an auto sidebar, live reload, and
Mermaid/SVG pan/zoom. HTML over Markdown — zero build, zero dependencies.

## Why

Docs tools like MkDocs and Docsify are Markdown-first. If you write docs as HTML
(great for AI-generated, richly-styled content), there's nothing to *render* —
you only need to **navigate** them. `docs-in-html` is a tiny dev server that does
exactly that, and adds Mermaid pan/zoom on top.

## Install

```bash
npm install -g docs-in-html     # or just: npx docs-in-html ./my-docs
```

Requires Node ≥ 18.

## Use

```bash
docs-in-html ./docs-html              # serve a folder (opens the browser)
docs-in-html ./docs --port 5000       # custom port
docs-in-html ./docs --no-open         # don't auto-open
docs-in-html init ./new-docs          # scaffold a starter index.html
```

## Features

- **Auto sidebar tree** generated from your folder structure (collapsible, with collapse memory)
- **Live reload** — edit a doc, only that one reloads (sidebar state preserved)
- **Pan/zoom/lightbox for diagrams** — Mermaid blocks **and** standalone inline SVGs
  (any `<svg>` inside a `<figure>`, or anything marked `.panzoom` / `.diagram` / `.zoomable`).
  Injected automatically; clicks inside buttons/links are never hijacked.
- Use **your own `index.html`**, or the built-in shell when a folder has none
- **Hide the sidebar** with the toggle button (state remembered)
- Zero dependencies, zero build

## Authoring

Write plain HTML. Use `<div class="mermaid">…</div>` blocks plus the Mermaid core
script tags (LLMs add these automatically), or just drop an inline `<svg>` inside a
`<figure>` — it becomes pan/zoomable too. Need an SVG zoomable but it's not in a
figure? Add `class="diagram"` (or `panzoom` / `zoomable`) to it or any ancestor.
No template, no boilerplate — the pan/zoom layer is injected for you. The same file
also renders standalone (`file://` or any static host), just without the zoom.

## License

MIT
