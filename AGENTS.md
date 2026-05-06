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
- `json-utils.js` — shared JSON parsing/validation helpers used by the JSON tools (inlined into HTML at build time)

## Stack

- **Bundler**: Parcel 2 (`npm run dev` for dev server, `npm run build` for production)
- **CSS**: Tailwind CSS v4 via PostCSS (`styles.css` is the shared stylesheet)
- **No JS framework** — vanilla JS inline in each HTML file
- **No npm packages at runtime** — devDependencies only

## Adding a new tool

1. Create a new `.html` file inside `src/` (e.g. `src/base64.html`) following the pattern of an existing tool.
2. Include the shared site header at the top of `<body>` with a back-link to `index.html` — copy the header block from an existing tool.
3. Include the shared footer at the bottom with `&copy; <span id="year"></span> Irfan Maulana<span id="deploy-time"></span>` and the matching inline footer script — copy the `<script>` block from an existing tool. It uses a `"__BUILD_TIME__"` placeholder that `scripts/build.mjs` replaces with the real ISO timestamp at build time.
4. Add a card linking to it in `index.html` under the appropriate section (or create a new section), and update the "Current tools" list at the top of this file.
5. Use `<link rel="stylesheet" href="styles.css">` for shared styles.
6. Keep all logic inline in a `<script>` tag at the bottom of the file.

## Conventions

- All processing must stay client-side — never add a server dependency or external API call.
- Match the dark UI style: `bg-gray-950` body, `border-gray-800` borders, `text-gray-200` base text, blue hover accents (`hover:border-blue-400`).
- Each tool page has a shared site header with a back-link to `index.html`.
- Build output goes to `dist/` — do not commit this directory.
- The `parcel-namer-no-hash` local plugin strips content hashes from output filenames so URLs stay stable.
- **All JS is inlined into HTML at build time.** `scripts/build.mjs` inlines every `.js` reference into its parent HTML after bundling so `dist/` contains only `.html` and `.css` files.

## Commands

```bash
npm run dev      # start dev server (watches all *.html)
npm run build    # production build → dist/
```
