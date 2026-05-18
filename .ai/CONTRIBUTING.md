# Adding a New Tool

## Steps

1. Copy `src/_tool-template.html` to `src/<slug>.html` and replace every `@@PLACEHOLDER@@` token (tool name, slug, icon, max-width, subtitle). The template has the correct partial order, sentinel comments, and footer position already in place — do not rearrange them.
2. Add an entry for the tool in `src/tools.json` (`slug`, `name`, `icon`, `category`, `card`, `description`, `faqs`). `card` is a short one-liner shown on the index card; `description` is the full SEO text. Then run `npm run generate:sections` to write the FAQ block, "More tools" cross-link block, and JSON-LD structured data into `src/<slug>.html` (and refresh every other tool's "More tools" list so the new tool shows up there too). Run `npm run generate:index` to add the tool card to `index.html`. Also run `npm run generate:favicon` to rasterize the tool's emoji into `src/favicon-<slug>.png` and commit it.
3. Include shared partials in `<head>` — see "Shared HTML partials" below. The minimum head is `meta-base` + per-page meta + `meta-social` + per-page icon (`<link rel="icon" type="image/png" sizes="32x32" href="favicon-<slug>.png">`) + `head-fonts` + `<link rel="stylesheet" href="styles.css">` + optional per-page `<style>` + `head-theme`.
4. Include the shared site header at the top of `<body>` with a `<nav aria-label="Breadcrumb">` linking back to `index.html` — copy the header block from an existing tool. Mark the current page span with `aria-current="page"`. See "Semantic landmarks" in `.ai/UI_CONVENTIONS.md`.
5. Wrap the tool UI in `<main class="…">` (exactly one `<main>` per page). Inside, the page heading goes in an `<h1>` that matches the tool name.
6. The template already contains the correct footer markup and `<include src="_partials/footer-script.html"></include>`. Do not move them — the required order is: `</main>` → optional module `<script>` → `footer-script` include → FAQ sentinel → more-tools sentinel → `<footer>`. The footer-script partial uses a `"__BUILD_TIME__"` placeholder that `scripts/build.mjs` replaces with the real ISO timestamp.
7. Run `npm run generate:index` to insert the tool card into `index.html` automatically (the script reads `tools.json` and regenerates the sentinel-wrapped grid). Update the "Current tools" list in `.ai/TOOLS.md` and add a row for the new tool in the tools table in `README.md`.
8. Use `<link rel="stylesheet" href="styles.css">` for shared styles.
9. Keep all logic inline in a `<script>` tag at the bottom of the file.

## Shared HTML partials

Common markup lives in `src/_partials/` and is inlined at build time via `posthtml-include` (configured in `.posthtmlrc`). Use `<include src="_partials/<name>.html"></include>`:

- `meta-base.html` — charset, viewport, `google-site-verification`, author, theme-color, robots, and a site-wide fallback favicon (`favicon.png`, the 🛠️ icon). Place at the top of `<head>`. Per-tool pages declare their own `<link rel="icon">` after the partial, which the browser uses in preference to the fallback.
- `meta-social.html` — `og:type`, `og:site_name`, `og:image*`, `twitter:card`, `twitter:image`. Place after the per-page Open Graph and Twitter title/description tags.
- `head-fonts.html` — Google Fonts preconnects + the IBM Plex Mono / Bricolage Grotesque stylesheet. Place before `styles.css`.
- `head-theme.html` — inline theme-init script. Place last in `<head>` so the `data-theme` attribute is set before the body renders.
- `footer-script.html` — copyright/deploy-time init script. Place after `</footer>` (and before any tool-specific `<script>` blocks).

The site header (the `HTML Tools / Tool Name` strip) is intentionally **not** a partial because the tool name varies per page; copy it from an existing tool.

## Tools manifest

`src/tools.json` is the single source of truth for the site name, publisher, and per-tool metadata (slug, name, icon, category, card, description, faqs, and optional `internal: true` for contributor-only pages such as the design-system reference). `card` is the short one-liner shown on the index card; if omitted the full `description` is used. `src/tools.json` feeds two generators:

- `scripts/generate-index.mjs` (`npm run generate:index`) — rewrites the `<!-- BEGIN:tool-grid --> … <!-- END:tool-grid -->` sentinel in `src/index.html` with category sections built from `tools.json` order. Run this whenever a tool is added, removed, or recategorised.
- `scripts/generate-sections.mjs` (`npm run generate:sections`) — writes three blocks directly into `src/*.html` so they're visible in `npm run dev` and bundle through Parcel like the rest of the markup:

- JSON-LD `WebApplication` + `BreadcrumbList` + `FAQPage` blocks on each tool page (and `WebSite` on the index) — inside `<head>`, wrapped in `<!-- BEGIN:json-ld --> … <!-- END:json-ld -->`.
- A visible FAQ section (collapsible `<details>` blocks) before the footer on every tool page — wrapped in `<!-- BEGIN:faq --> … <!-- END:faq -->`.
- A "More tools" cross-link block before the footer on every tool page (excluding the index) — wrapped in `<!-- BEGIN:more-tools --> … <!-- END:more-tools -->`.

Each tool's `faqs` is an array of `{ q, a }` entries; aim for 3–5 genuinely common questions per tool. New tools must be registered here so the generator picks them up.

**Re-run both `npm run generate:index` and `npm run generate:sections` whenever you edit `src/tools.json`.** Both scripts are idempotent — sentinel-wrapped regions are replaced in place on every run, so re-running can never produce duplicate blocks. The generated regions are committed as source.

## Social card image

The 1200×630 social card lives at `src/og-image.png` and is committed to the repo. The source is `src/og-image.svg`; rerun `npm run generate:og` whenever the SVG changes and commit the regenerated PNG. The build only copies `src/og-image.png` to `dist/` — it does not regenerate it on every build.

## Favicons

Each tool has a 32×32 PNG favicon rasterized from its `tools.json` emoji, plus a site-wide fallback `src/favicon.png` (🛠️) referenced from `_partials/meta-base.html`. The PNGs live in `src/favicon-<slug>.png` (and `src/favicon.png`) and are committed to the repo; Parcel picks them up via per-page `<link rel="icon" type="image/png" sizes="32x32" href="favicon-<slug>.png">`.

Rerun `npm run generate:favicon` whenever a tool's icon changes or a new tool is added to `tools.json`, then commit the regenerated PNGs. The generator reads Twemoji SVGs from `node_modules/@twemoji/svg` (no network at run time) and renders them with Resvg.

When adding a new tool, after registering it in `tools.json` and running `npm run generate:favicon`, point the per-page `<link rel="icon">` at the new `favicon-<slug>.png`.
