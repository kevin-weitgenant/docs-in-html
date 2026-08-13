# htmlovermd

Navigate folders of **HTML docs** with an auto sidebar, live reload, and Mermaid pan/zoom.
HTML over Markdown — zero build, zero dependencies.

## Why

Docs tools like MkDocs and Docsify are Markdown-first. If you write docs as HTML
(great for AI-generated, richly-styled content), there's nothing to *render* —
you only need to **navigate** them. `htmlovermd` is a tiny dev server that does
exactly that, and adds Mermaid pan/zoom on top.

## Install

```bash
npm install -g htmlovermd     # or just: npx htmlovermd ./my-docs
```

Requires Node ≥ 18.

## Use

```bash
htmlovermd ./docs-html              # serve a folder (opens the browser)
htmlovermd ./docs --port 5000       # custom port
htmlovermd ./docs --no-open         # don't auto-open
htmlovermd init ./new-docs          # scaffold a starter index.html
```

## Features

- **Auto sidebar tree** generated from your folder structure (collapsible, with collapse memory)
- **Live reload** — edit a doc, only that one reloads (sidebar state preserved)
- **Mermaid pan/zoom/lightbox** injected automatically into any doc with diagrams
- Use **your own `index.html`**, or the built-in shell when a folder has none
- **Hide the sidebar** with the toggle button (state remembered)
- Zero dependencies, zero build

## Authoring

Write plain HTML with `<div class="mermaid">…</div>` blocks plus the Mermaid core
script tags (LLMs add these automatically). No template, no boilerplate — the
pan/zoom layer is injected for you. The same file also renders standalone
(`file://` or any static host), just without the zoom.

## License

MIT
