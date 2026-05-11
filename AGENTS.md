# Agent Guidelines — HTML Tools

## Project overview

A collection of single-file browser-native utilities built with Parcel + Tailwind CSS v4. Each tool is a self-contained HTML file; all logic runs client-side with no backend.

Current tools (all under `src/`):
- `json-formatter.html` — prettify, minify, validate JSON with syntax highlighting
- `json-to-ts.html` — convert JSON to TypeScript interfaces
- `json-diff.html` — compare two JSON objects and highlight differences
- `regex-tester.html` — test JavaScript regular expressions live: match / replace / split modes, flag toggles, sample patterns, capture-group breakdown, cheat sheet
- `svg-to-jsx.html` — convert SVG markup to React JSX
- `index.html` — landing page linking all tools
- `json-sort.html` — sort JSON object keys alphabetically (A→Z or Z→A), recursively
- `csv-to-json.html` — convert between JSON and CSV with smart type inference, RFC 4180 quoting, and configurable nested-object handling
- `json-to-yaml.html` — convert between JSON and YAML (anchor + alias resolution, multi-document support, configurable block/flow output) — uses js-yaml UMD bundle inlined at build time
- `gradients.html` — curated gradient gallery (87 gradients); copy CSS/Tailwind or export PNG
- `blob.html` — blob generator: CSS border-radius blobs (8-value syntax, animate) + SVG blobs (catmull-rom path, copy/download)
- `waves.html` — wave generator: single SVG wave (amplitude, frequency, position, gradient fill) + stacked waves (layers, spacing, color interpolation); copy/download SVG
- `image-converter.html` — image format converter: drop PNG/JPEG/WebP/AVIF/GIF/BMP, re-encode as PNG/JPEG/WebP/AVIF with quality slider, before/after byte size, drag-to-compare visual diff, optional max-dimension resize, batch zip download
- `json-utils.js` — shared JSON parsing/validation helpers used by the JSON tools (separate hashed bundle, long-cached)
- `image-utils.js` — shared image helpers (`supportsMime`, `formatBytes`, `formatPct`, `computeTargetSize`, `sourceHasAlpha`, `swapExtension`, `FORMAT_INFO`, `buildStoreZip`); separate hashed bundle, long-cached

## Stack

- **Bundler**: Parcel 2 (`npm run dev` for dev server, `npm run build` for production)
- **CSS**: Tailwind CSS v4 via PostCSS (`styles.css` is the shared stylesheet)
- **No JS framework** — vanilla JS inline in each HTML file
- **No npm packages at runtime** — devDependencies only

## Adding a new tool

1. Create a new `.html` file inside `src/` (e.g. `src/base64.html`) following the pattern of an existing tool.
2. Add an entry for the tool in `src/tools.json` (`slug`, `name`, `icon`, `category`, `description`). The build uses this manifest to emit per-tool JSON-LD structured data; future cross-tool features (related links, FAQ, etc.) will read it too.
3. Include shared partials in `<head>` — see "Shared HTML partials" below. The minimum head is `meta-base` + per-page meta + `meta-social` + per-page icon + `head-fonts` + `<link rel="stylesheet" href="styles.css">` + optional per-page `<style>` + `head-theme`.
4. Include the shared site header at the top of `<body>` with a `<nav aria-label="Breadcrumb">` linking back to `index.html` — copy the header block from an existing tool. Mark the current page span with `aria-current="page"`. See "Semantic landmarks" below.
5. Wrap the tool UI in `<main class="…">` (exactly one `<main>` per page). Inside, the page heading goes in an `<h1>` that matches the tool name.
6. Include the shared footer at the bottom with `&copy; <span id="year"></span> Irfan Maulana<span id="deploy-time"></span>` and end with `<include src="_partials/footer-script.html"></include>`. The footer-script partial uses a `"__BUILD_TIME__"` placeholder that `scripts/build.mjs` replaces with the real ISO timestamp.
7. Add a card linking to it in `index.html` under the appropriate section (or create a new section), update the "Current tools" list in `AGENTS.md`, and add a row for the new tool in the tools table in `README.md`.
8. Use `<link rel="stylesheet" href="styles.css">` for shared styles.
9. Keep all logic inline in a `<script>` tag at the bottom of the file.

## Shared HTML partials

Common markup lives in `src/_partials/` and is inlined at build time via `posthtml-include` (configured in `.posthtmlrc`). Use `<include src="_partials/<name>.html"></include>`:

- `meta-base.html` — charset, viewport, `google-site-verification`, author, theme-color, robots. Place at the top of `<head>`.
- `meta-social.html` — `og:type`, `og:site_name`, `og:image*`, `twitter:card`, `twitter:image`. Place after the per-page Open Graph and Twitter title/description tags.
- `head-fonts.html` — Google Fonts preconnects + the IBM Plex Mono / Space Grotesk stylesheet. Place before `styles.css`.
- `head-theme.html` — inline theme-init script. Place last in `<head>` so the `data-theme` attribute is set before the body renders.
- `footer-script.html` — copyright/deploy-time init script. Place after `</footer>` (and before any tool-specific `<script>` blocks).

The site header (the `HTML Tools / Tool Name` strip) is intentionally **not** a partial because the tool name varies per page; copy it from an existing tool.

## Tools manifest

`src/tools.json` is the single source of truth for the site name, publisher, and per-tool metadata (slug, name, icon, category, description, faqs). `scripts/build.mjs` reads it to:

- Inject JSON-LD `WebApplication` + `BreadcrumbList` + `FAQPage` blocks on each tool page (and `WebSite` on the index).
- Inject a visible FAQ section (collapsible `<details>` blocks) before the cross-tool block on every tool page.
- Inject a "More tools" cross-link block before the footer on every tool page (excluding the current tool and the index).

Each tool's `faqs` is an array of `{ q, a }` entries; aim for 3–5 genuinely common questions per tool. New tools must be registered here so the build picks them up. **Note:** these injections happen only at production build time (`npm run build`), not in dev (`npm run dev`).

## Pull request rules

- **Every PR must target `main`. Never set a PR's base to another in-flight PR's branch.** Merged must mean deployed.
- Stacked PRs (one PR's base = another PR's branch) are a silent footgun: when the dependency merges into `main`, GitHub does **not** auto-rebase the stacked PR. Merging the stacked PR while its base still points at the now-defunct feature branch lands the merge commit on that dead branch instead of `main` — the PR shows as "Merged" but the changes never ship.
- If a branch genuinely needs commits from another in-flight PR, either (a) wait for the dependency to merge first and rebase onto `main`, or (b) absorb the rebase pain at merge time. Never use a non-`main` base as a shortcut.

## Tracking issues

Umbrella issues (e.g. #27 for new tool ideas, #13 for SEO improvements) are the source of truth for what's planned, in flight, and shipped. Keep them honest:

- **When you open a child issue or PR for an item on an umbrella**, immediately edit the umbrella to flip that item's marker and link the child. Use `✅ shipped` / `📝 spec'd (issue or PR open)` / `⬜ not started`.
- **When a PR merges**, flip the umbrella marker to ✅ and link the file path (e.g. `src/<slug>.html`) so the umbrella shows what actually exists, not just what was intended.
- Don't leave dangling `📝` markers — if a child issue is closed without shipping, flip back to ⬜ with a one-line note.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). Format: `<type>(<optional scope>): <description>`.

Types: `feat` (new user-facing capability), `fix` (bug fix), `docs`, `style` (formatting / CSS / non-behavioral UI tweaks), `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.

Rules: present-tense description, lowercase first letter, no trailing period. Keep the subject line ≤72 characters; put detail in the body. Use a `BREAKING CHANGE:` footer when applicable.

Examples:
- `feat: add npm run preview script`
- `fix(spacing): tighten bottom-section vertical padding`
- `docs: document semantic landmarks convention`
- `refactor(build): extract jsonLdForPage helper`

## Conventions

- All processing must stay client-side — never add a server dependency or external API call.
- Match the dark UI style: `bg-gray-950` body, `border-gray-800` borders, `text-gray-200` base text, blue hover accents (`hover:border-blue-400`).
- Each tool page has a shared site header with a back-link to `index.html`.
- Build output goes to `dist/` — do not commit this directory.
- **HTML pages keep stable filenames** (`index.html`, `image-converter.html`, etc.) — they're entry bundles, served at predictable URLs. **Every other asset Parcel emits gets a content hash** in the filename (`styles.{hash}.css`, `theme.{hash}.js`, `json-utils.{hash}.js`, …). Hashed assets are cached forever (`Cache-Control: public, max-age=31536000, immutable` via `_headers`); HTML revalidates after 60s so a deploy propagates within ~60s.
- Per-tool logic stays in an inline `<script>` at the bottom of each HTML file (see "Adding a new tool" step 9). Only **shared** helpers (`theme.js`, `json-utils.js`, `image-utils.js`) live as separate hashed bundles so they cache once across the suite.

## Design system

Shared UI components live in `src/styles.css` (the "Shared components" block at the end) and are catalogued in **`src/design-system.html`** — a contributor reference page reachable at `/design-system.html`. It's intentionally **not** linked from the index, listed in `tools.json`, included in the sitemap, or referenced in `_redirects` (filtered out via `INTERNAL_PAGES` in `scripts/build.mjs`).

When building a new tool:

1. **Reach for the catalogued classes first** — `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-active` / `.btn-sm`, `.tab-btn`, `.pill` / `.pill-sm` / `.pill.on`, `.chip`, `.input` / `.input-mono`, `.textarea`, `.num-input`, `.select`, `.switch` (pill toggle — `<label class="switch"><input type="checkbox"><span>Label</span></label>`; use for a single binary state, not multi-select option lists — those stay regular checkboxes), `.range`, `.swatch`, `.drop-zone` (with `.compact` and `.dragover`), `.card` / `.card-lift`, `.file-card`, `.toolbar` (options strip — flex row of `<label>`s wrapping `.select` / `.num-input` / checkbox controls), `.disclosure` (markup: `<details class="disclosure"><summary>…</summary><div class="disclosure-content"><div class="disclosure-body">…</div></div></details>`), `.cheat-table`, `.error-bar` / `.warn-bar`, `.stats` + `.delta-good` / `.delta-bad` / `.delta-neutral`, `.thumb-box` / `.thumb-label`, `.diff-wrap` / `.diff-handle` / `.diff-slider` / `.diff-tag`, plus the JSON tree primitives (`.json-key`, `.json-string`, `.json-number`, `.json-bool`, `.json-null`, `.json-punct`, `.tree-row`, `.toggle-btn`, `.tree-children`).
2. **If the pattern doesn't exist yet**, prototype it inline in the new tool. Once a second tool needs the same thing, promote the canonical definition into `src/styles.css` and add a section to `design-system.html`. Don't pre-extract — wait for a real second user.
3. **Don't redefine a catalogued class inline.** If the existing definition doesn't fit, fix it in `styles.css` so every tool benefits — or open an issue to discuss before forking the pattern. In particular: never hardcode `#3b82f6` / `#1e3a8a` for "active" states — use `var(--accent)` / `var(--accent-h)` (or just inherit them via the shared class) so the accent swatch in the tweaks panel actually recolors the page.

The textareas in the JSON-family tools still use ad-hoc Tailwind (`w-full h-[500px] … p-4 leading-relaxed`) instead of `.textarea` because the shared class has tighter padding/line-height suited for one-line inputs, not the code-editor surface those tools need. If a third tool adopts the same pattern, promote a `.textarea-code` (or similar) variant rather than continuing to inline.

## Emoji conventions

Emojis are a load-bearing part of this site's visual language — keep them.

- **Action buttons** prefix their label with a relevant emoji: 📋 Copy, ⬇️ Download, 🗑️ Clear, ↩️ Reset, ✨ Prettify, 🗜️ Minify, 🆚 Compare, 🔍 Search, 🌳 Tree, 📄 Raw, 📥 Load sample, 🔄 Re-encode, 🎲 Random, ▶️ Animate, 🔀 Shuffle. When adding a new action, pick a glyph that reads at-a-glance — the icon is a navigational anchor, not just decoration.
- **Breadcrumbs and `<h1>`s** lead with the tool's icon (matches `tools.json` → `icon`).
- **Disclosure summaries** with a clear "verb" use an emoji prefix (🔍 Explain, 📋 Copy as code, 📖 Cheat sheet). FAQ entries are body copy and stay plain.
- **Sample chips** use category emojis (📧 Email, 🌐 IPv4, 🎨 Hex color, etc.).
- **Don't strip emojis when refactoring.** Tabs, tiny segmented controls (e.g. `CSS` / `TW`), single-letter pills (regex flags `g i m s u …`), direction buttons whose label is already an arrow (`JSON → CSV`, `A → Z`), and the dynamically-generated `CSS` / `TW` / `PNG` chips in the gradients grid are intentionally text-only — leave them alone.

## Semantic landmarks (every page)

Each page must follow this skeleton so screen readers, search engines, and Lighthouse audits all see the same structure:

```html
<body>
  <header>            <!-- site banner -->
    <nav aria-label="Breadcrumb" class="…">  <!-- tool pages only; index has a hero header here instead -->
      <a href="index.html">HTML Tools</a>
      <span>/</span>
      <span aria-current="page">🛠️ Tool Name</span>
    </nav>
  </header>

  <main class="…">     <!-- exactly one per page; wraps the tool UI + content + FAQ + cross-tool block -->
    <header class="mb-7">
      <h1>🛠️ Tool Name</h1>   <!-- exactly one h1, matches the page topic -->
    </header>
    <!-- tool UI, content sections, FAQ, More tools -->
  </main>

  <footer>…</footer>   <!-- one per page, sibling of <main> -->
</body>
```

Rules:

- Exactly one `<h1>` per page; it should match the page topic, not the site name.
- Heading order must not skip levels: `<h1>` → `<h2>` → `<h3>`. Don't drop directly from `<h2>` to `<h4>`.
- Wrap the page's primary content in `<main>`. The `<header>` and `<footer>` are siblings of `<main>`, not children.
- The breadcrumb in the site banner uses `<nav aria-label="Breadcrumb">`; mark the current page span with `aria-current="page"`.

## Social card image

The 1200×630 social card lives at `src/og-image.png` and is committed to the repo. The source is `src/og-image.svg`; rerun `npm run generate:og` whenever the SVG changes and commit the regenerated PNG. The build only copies `src/og-image.png` to `dist/` — it does not regenerate it on every build.

## Commands

```bash
npm run dev          # start dev server (watches all *.html)
npm run build        # production build → dist/
npm run preview      # serve dist/ locally to spot-check the production build
npm run generate:og  # regenerate src/og-image.png from src/og-image.svg
```
