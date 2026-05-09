# Agent Guidelines — HTML Tools

## Project overview

A collection of single-file browser-native utilities built with Parcel + Tailwind CSS v4. Each tool is a self-contained HTML file; all logic runs client-side with no backend.

Current tools (all under `src/`):
- `json-formatter.html` — prettify, minify, validate JSON with syntax highlighting
- `json-to-ts.html` — convert JSON to TypeScript interfaces
- `json-diff.html` — compare two JSON objects and highlight differences
- `svg-to-jsx.html` — convert SVG markup to React JSX
- `index.html` — landing page linking all tools
- `json-sort.html` — sort JSON object keys alphabetically (A→Z or Z→A), recursively
- `gradients.html` — curated gradient gallery (87 gradients); copy CSS/Tailwind or export PNG
- `blob.html` — blob generator: CSS border-radius blobs (8-value syntax, animate) + SVG blobs (catmull-rom path, copy/download)
- `waves.html` — wave generator: single SVG wave (amplitude, frequency, position, gradient fill) + stacked waves (layers, spacing, color interpolation); copy/download SVG
- `json-utils.js` — shared JSON parsing/validation helpers used by the JSON tools (inlined into HTML at build time)

## Stack

- **Bundler**: Parcel 2 (`npm run dev` for dev server, `npm run build` for production)
- **CSS**: Tailwind CSS v4 via PostCSS (`styles.css` is the shared stylesheet)
- **No JS framework** — vanilla JS inline in each HTML file
- **No npm packages at runtime** — devDependencies only

## Adding a new tool

1. Create a new `.html` file inside `src/` (e.g. `src/base64.html`) following the pattern of an existing tool.
2. Include shared partials in `<head>` — see "Shared HTML partials" below. The minimum head is `meta-base` + per-page meta + `meta-social` + per-page icon + `head-fonts` + `<link rel="stylesheet" href="styles.css">` + optional per-page `<style>` + `head-theme`.
3. Include the shared site header at the top of `<body>` with a back-link to `index.html` — copy the header block from an existing tool.
4. Include the shared footer at the bottom with `&copy; <span id="year"></span> Irfan Maulana<span id="deploy-time"></span>` and end with `<include src="_partials/footer-script.html"></include>`. The footer-script partial uses a `"__BUILD_TIME__"` placeholder that `scripts/build.mjs` replaces with the real ISO timestamp.
5. Add a card linking to it in `index.html` under the appropriate section (or create a new section), update the "Current tools" list in `AGENTS.md`, and add a row for the new tool in the tools table in `README.md`.
6. Use `<link rel="stylesheet" href="styles.css">` for shared styles.
7. Keep all logic inline in a `<script>` tag at the bottom of the file.

## Shared HTML partials

Common markup lives in `src/_partials/` and is inlined at build time via `posthtml-include` (configured in `.posthtmlrc`). Use `<include src="_partials/<name>.html"></include>`:

- `meta-base.html` — charset, viewport, `google-site-verification`, author, theme-color, robots. Place at the top of `<head>`.
- `meta-social.html` — `og:type`, `og:site_name`, `og:image*`, `twitter:card`, `twitter:image`. Place after the per-page Open Graph and Twitter title/description tags.
- `head-fonts.html` — Google Fonts preconnects + the IBM Plex Mono / Syne stylesheet. Place before `styles.css`.
- `head-theme.html` — inline theme-init script. Place last in `<head>` so the `data-theme` attribute is set before the body renders.
- `footer-script.html` — copyright/deploy-time init script. Place after `</footer>` (and before any tool-specific `<script>` blocks).

The site header (the `HTML Tools / Tool Name` strip) is intentionally **not** a partial because the tool name varies per page; copy it from an existing tool.

## Conventions

- All processing must stay client-side — never add a server dependency or external API call.
- Match the dark UI style: `bg-gray-950` body, `border-gray-800` borders, `text-gray-200` base text, blue hover accents (`hover:border-blue-400`).
- Each tool page has a shared site header with a back-link to `index.html`.
- Build output goes to `dist/` — do not commit this directory.
- The `parcel-namer-no-hash` local plugin strips content hashes from output filenames so URLs stay stable.
- **All JS is inlined into HTML at build time.** `scripts/build.mjs` inlines every `.js` reference into its parent HTML after bundling so `dist/` contains only `.html` and `.css` files.

## Social card image

The 1200×630 social card lives at `src/og-image.png` and is committed to the repo. The source is `src/og-image.svg`; rerun `npm run generate:og` whenever the SVG changes and commit the regenerated PNG. The build only copies `src/og-image.png` to `dist/` — it does not regenerate it on every build.

## Commands

```bash
npm run dev          # start dev server (watches all *.html)
npm run build        # production build → dist/
npm run generate:og  # regenerate src/og-image.png from src/og-image.svg
```
