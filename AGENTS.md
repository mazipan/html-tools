# Agent Guidelines — HTML Tools

> ⚠️ Before you start, skim [`COMMON_BUGS.md`](COMMON_BUGS.md) — it lists non-obvious footguns from project conventions (e.g. `image-utils.js` is a classic script, not an ES module). One read is enough to skip a class of "the button silently does nothing" debugging.

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
- `meta-tag-preview.html` — meta tag preview: paste a URL (fetched via `https://oge.vercel.app/api?url=` CORS proxy) or raw `<head>` HTML; renders live Google search, Twitter/X card, Facebook OG, and LinkedIn preview cards; collapsible raw-tags table shows all extracted `og:*`, `twitter:*`, title, description, canonical, robots, and viewport properties
- `image-converter.html` — image format converter: drop PNG/JPEG/WebP/AVIF/GIF/BMP, re-encode as PNG/JPEG/WebP/AVIF with quality slider, before/after byte size, drag-to-compare visual diff, optional max-dimension resize, batch zip download. Encoding goes through the shared `image-encode-worker.js`.
- `image-resizer.html` — batch image resizer: drop up to 100 images, resize via percentage (shrink-only), exact W×H with aspect-lock + center-crop, or max-dimension cap with aspect-lock; social-card presets (OG/Twitter/Facebook/LinkedIn/Pinterest) shown only when aspect-lock is off; same-as-input / PNG / JPEG / WebP output; filename templating (defaults to overwriting the source name); single + zip download. With one file loaded, switches to a hero or diff-slider preview at the target aspect. Encoding happens in `image-encode-worker.js` (Web Worker + OffscreenCanvas).
- `image-compressor.html` — image compressor: drop up to 50 images, pick a quality preset (Lossless / Visually identical / Smaller / Smallest) or a target size in KB. Target-size mode binary-searches the quality value inside the worker (up to 8 iterations per file, ±5% tolerance). Format strategy: Same as input / Auto / Force WebP. Optional long-edge resize toggle. Single + zip download.
- `cron-decoder.html` — cron expression decoder + builder: paste any 5-field or 6-field cron expression (or an `@hourly`/`@daily`/… shortcut) to get a plain-English description and the next 10 local-time run times; or switch to Build mode and assemble one field at a time with per-field validation, chip-style shortcuts, and a live preview. Parses `*`, `*/n`, `a-b`, `a,b,c`, `a-b/n`, month/DOW names, and treats DOM `L` as the actual last day of the month; other extended syntax (`W`, `#`, DOW `L`) parses best-effort and surfaces an "approximate" warning.
- `image-cropper.html` — image cropper: drop one image, drag a crop box on the preview (8 resize handles, optional rule-of-thirds grid, EXIF orientation honored). Rectangle (default) or Circle shape — circle forces 1:1 + an alpha-capable format (PNG / WebP), and the worker clips a transparent circular mask before encoding. Lock an aspect ratio (Free / 1:1 / 4:3 / 3:2 / 16:9 / 9:16 / Original / Custom); nudge with keyboard (arrows; shift = 10 px; Ctrl/Cmd+arrow resizes). Numeric X/Y/W/H inputs are bidirectionally synced with the visual box. Download or Copy to clipboard (falls back to PNG on browsers that reject other MIME types). Single-image by design — dropping a second image replaces the first. Encoding uses the shared `image-encode-worker.js` via its `crop` message type.
- `og-image-builder.html` — OG image builder: design a 1200×630 social card (title + subtitle + gradient-or-solid background + optional logo overlay + domain badge), live canvas preview, three starting templates (Minimal / Bold / Classic). Export as PNG via `canvas.toBlob` or copy to the clipboard via `ClipboardItem`. A single render pipeline (`drawAll(ctx)`) is used for both the dpr-scaled preview canvas and a fresh 1200×630 export canvas, so the PNG matches the preview pixel-for-pixel. The page inlines a curated 20-entry gradient palette (subset of the full `gradients.html` catalog) and auto-shrinks the title font in 4 px steps until it fits the 60 px safe-area inset.
- `user-agent-parser.html` — user-agent parser: paste any UA string (textarea pre-fills with `navigator.userAgent`) and see a structured breakdown — browser + version, layout engine, OS marketing name, device type, CPU architecture, raw string. Parser is vanilla JS inline (no external library): browsers checked in priority order (Edg* before Chrome, Chrome before Safari) with separate bot detection (Googlebot, Bingbot, Twitterbot, facebookexternalhit, …) that preserves the underlying engine so a UA can be flagged as a bot without losing the Chrome/Safari sub-string. Windows NT → marketing name (`NT 10.0` → "Windows 10/11"), macOS code names (10.15 Catalina through 15 Sequoia), iOS/iPadOS/Android version pull, CPU detection (`x86_64`/`WOW64`/`arm64`/`aarch64`). Raw `Token/Version` pairs surface in a collapsible disclosure for transparency.
- `qr-code-generator.html` — QR code generator: paste any text, URL, email (`mailto:`), SMS (`SMSTO:`), WiFi config (`WIFI:T:WPA;S:…;P:…;;`), vCard, or geo URI and get a live SVG preview. Options: error-correction level (L/M/Q/H with a tooltip explainer), corner style for the three position-detection patterns (Square / Rounded / Circle / Eye — finder modules are skipped from the body path and redrawn as styled shapes with `fill-rule="evenodd"`; eye style uses a per-corner-radius helper so each finder gets three quarter-circle corners and one sharp corner pointing inward toward the QR center), foreground + background color (with a transparent-background toggle), quiet-zone toggle (4-module border, on by default), an automatic floating `tools.mazipan.space` watermark that only renders when the quiet zone is on AND the background isn't transparent — it sits inside the existing bottom 4-module border, so it doesn't extend the SVG viewBox, doesn't overlap QR modules, and doesn't print onto unknown surfaces, and an optional center-logo section (collapsible, with an 11-entry preset grid — None + Gmail / WiFi / SMS / Maps / WhatsApp / YouTube / Instagram / X / Facebook / Telegram (brand SVGs vendored from Simple Icons, CC0; WiFi and SMS aren't brands and use hand-drawn generic glyphs) — plus a drop-zone for custom uploads). The logo is embedded in the output SVG via a data URI behind a rounded white pad, so the SVG download, the live preview, and the PNG export all look identical. Adding any logo auto-locks the EC level to H. Export as SVG (`qr-code.svg`), PNG at 256 / 512 / 1024 px, or copy PNG via `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`. Encoder is a vendored copy of [Project Nayuki's `qrcodegen`](https://www.nayuki.io/page/qr-code-generator-library) (MIT, ~800 lines) inlined in a `<script>` block — all four QR modes (numeric, alphanumeric, byte, kanji) auto-selected per segment, automatic version selection (1–40), automatic mask selection by penalty score. The capacity hint compares the UTF-8 byte length of the input against `QrCode.getNumDataCodewords(version, ecl)` for the chosen ECC; on overflow we surface a "lower EC level or shorten content" hint. The PNG pipeline serializes the unified SVG (which already contains the logo, white pad, and watermark) to a Blob URL, paints it onto a canvas, then `canvas.toBlob('image/png')` — no separate logo draw step.
- `lorem-ipsum.html` — Lorem Ipsum generator: pick a dictionary (Lorem / Cupcake / Bacon / Hipster), an output mode (Paragraphs / Sentences / Words / List items), and a count (1–500). Optional toggles for the classic "Lorem ipsum dolor sit amet…" intro (auto-disabled for non-Lorem dictionaries) and wrapping each paragraph in `<p>…</p>` (only meaningful in Paragraphs mode). Shuffle re-seeds; Copy / Download (`lorem-ipsum-<mode>-<count>.txt`) / Clear actions. Generator uses a seedable mulberry32 PRNG so output stays stable across non-Shuffle control changes and only re-rolls when Shuffle is clicked. All four dictionaries inline (~125–140 words each, ~6 KB gzipped total); no npm imports.
- `text-diff.html` — text diff: LCS-based line-by-line comparison of two plain-text inputs with word-level inline highlighting on changed pairs, split view with line numbers, scroll sync, ignore-whitespace and show-unchanged-context options, and clipboard copy in `+/-` format
- `favicon-generator.html` — favicon generator: drop an image (PNG/SVG/JPEG/WebP) or type an emoji, configure background color (or transparent), padding %, and shape (Square / Rounded / Circle). The page renders previews for the standard set (16/32/48/180/192/512) plus a 512×512 maskable variant (fixed 20% safe-area padding, opaque background regardless of the user's transparent toggle) and a `manifest.webmanifest` icons snippet. Download bundles everything as a single store-only zip via `buildStoreZip` from `image-utils.js`: `favicon.ico` (two-frame PNG-in-ICO, 16+32 px — assembled inline via a ~60-line writer that wraps the encoded PNG blobs in the standard ICONDIR/ICONDIRENTRY header), `favicon-{16,32,48}x{16,32,48}.png`, `apple-touch-icon.png` (180), `android-chrome-{192,512}x{192,512}.png`, `maskable-icon-512x512.png`, and `manifest.webmanifest`. Emoji input is grapheme-clamped via `Intl.Segmenter` so multi-codepoint glyphs (skin-tone modifiers, ZWJ sequences) stay intact; the rendered PNG uses the local system emoji font, which the page calls out in a one-line caveat.
- `svg-rasterizer.html` — SVG to Raster: paste or drop an SVG (textarea is also a drop target); parser extracts intrinsic dimensions from the root `<svg>`'s `width`/`height` attributes, falling back to `viewBox`, then 300×150. Live preview renders the source SVG as a Blob-URL `<img>` (debounced 200 ms, no canvas overhead). Output controls: W × H numeric inputs with a switch-style "🔒 Lock aspect" toggle that preserves the source ratio while editing either field; preset pills (Square 512 / Square 1024 / OG 1200×630 / Twitter 1600×900 / HD 1920×1080 / Natural size) ignore the lock so they always set both dimensions. Format pills: PNG (lossless, quality disabled), JPEG (lossy + opaque, with a color-swatch background picker for the alpha fill), WebP (lossy + alpha). Export pipeline: SVG text → `Blob` URL → `Image` → fresh canvas at exact W × H → `canvas.toBlob(mime, quality)`. Clipboard write force-converts to PNG (the only image MIME most browsers reliably allow on the clipboard). The page has no shared-bundle dependency — `formatBytes` is inlined since `image-utils.js` isn't needed here.
- `snippet-to-image.html` + `snippet-to-image.js` — code snippet to image: paste code, pick a language (16 curated) and a VS Code theme (8 curated), tweak window chrome (macOS dots / title bar / none), background (gradient / solid / transparent), padding, font (IBM Plex Mono / JetBrains Mono / Fira Code), font size, line height, line numbers, and width preset (Auto / Twitter 1600 / Square 1080) — export as PNG or copy to clipboard. Highlighting is VS Code-grade via [Shiki](https://shiki.style/) + `@shikijs/engine-javascript` (JS regex engine, no Oniguruma WASM payload). Eager imports: `@shikijs/core` + JS engine + the default lang (`typescript`) + the default theme (`github-dark`); every other grammar and theme is loaded lazily via dynamic `import()` so each becomes its own hashed Parcel chunk. Render pipeline is a single `drawAll(ctx)` used for both the dpr-scaled preview canvas and a fresh 1× export canvas, so the PNG matches the preview pixel-for-pixel. Text changes debounce 100 ms before re-tokenizing; layout knobs (padding, radius, shadow, font size, line numbers, width preset) repaint without re-tokenizing. Tab in the editor inserts two spaces. **Sibling-module pattern**: this is the first tool whose JS lives in a separate `src/snippet-to-image.js` referenced via `<script type="module" src="snippet-to-image.js"></script>` rather than inline. Parcel will *not* code-split bare-specifier imports out of an inline `<script type="module">` — the inline block is minified in place with `import "shiki/core"` left unresolved. Putting the body in a sibling file makes Parcel treat it as a proper ESM entry: it follows static imports, hoists or splits dynamic `import()` calls, and emits one hashed chunk per `@shikijs/langs/*` and `@shikijs/themes/*` import. If you add a new lang or theme, register it in both the registry array (for the dropdown) and the `fetchLang` / `fetchTheme` switch (so Parcel can statically resolve the chunk). Imports go to `@shikijs/core` (the underlying package) rather than `shiki/core` because Parcel's resolver doesn't currently follow Shiki's conditional `./core` export under the custom `unwasm` condition.
- `json-utils.js` — shared JSON parsing/validation helpers used by the JSON tools (separate hashed bundle, long-cached)
- `image-utils.js` — shared image helpers (`supportsMime`, `formatBytes`, `formatPct`, `computeTargetSize`, `sourceHasAlpha`, `swapExtension`, `FORMAT_INFO`, `buildStoreZip`); separate hashed bundle, long-cached. `computeTargetSize(srcW, srcH, opts)` understands three modes via `opts.mode`: `'max'` (default — fit inside maxW × maxH; converter uses this), `'exact'` (return `opts.targetW × opts.targetH`), and `'percent'` (scale by `opts.scale`).
- `image-encode-worker.js` — Web Worker that decodes a file with `createImageBitmap`, optionally resizes / applies a contain-cover-stretch fit, and encodes the result via `OffscreenCanvas.convertToBlob`. Used by the converter, resizer, compressor, and cropper. Default `encode` path handles resize + format conversion; the `crop` message type (used by the cropper) takes a source rect `(sx, sy, sw, sh)` and renders that region to a new canvas in a single draw. When `opts.targetKB` is set on the encode path, the worker runs a binary search on quality (capped at 8 iterations, default ±5% tolerance) and returns `{ blob, finalQuality, iterations, hitTarget }` so the page can surface the search detail.
- `pdf-splitter.html` + `pdf-splitter.js` — PDF splitter / page extractor: drop one PDF, click-select pages from a live thumbnail grid (shift-click range, ctrl-click add/remove, text range input synced bidirectionally), then Extract (selected pages → one PDF in selection order) or Split (one PDF per page or per consecutive range group, zipped via `buildStoreZip`). Page thumbnails rendered by `pdfjs-dist/legacy/build/pdf.mjs` with IntersectionObserver lazy loading (rootMargin 300 px) and a `thumbCache` Map keyed by 0-based sourceIndex. Worker URL: `scripts/build.mjs` copies `pdfjs-dist/legacy/build/pdf.worker.min.mjs` to `dist/pdf.worker.HASH.js` (content-hashed, bypassing Parcel entirely) and injects the filename into each HTML page via a `window.__PDF_WORKER_URL__ = "__PDF_WORKER_URL__"` placeholder — the same `__BUILD_TIME__` replacement mechanism. The JS reads `pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDF_WORKER_URL__`. **Do not use Parcel's `url:` scheme or `new URL()` for the pdfjs worker**: both produce extensionless chunk filenames on Netlify CI (fresh builds), which fail MIME-type validation when the browser tries to import them as modules. Sibling-module pattern; `image-utils.js` loaded as classic script for `buildStoreZip`.
- `pdf-page-manager.html` + `pdf-page-manager.js` — PDF page manager: drop one PDF, drag-to-reorder pages (HTML5 drag-and-drop; mobile: ↑/↓ arrow buttons per card), rotate per page via ↻ button (cycles 0→90→180→270°, keyboard R) or rotate-all toolbar pills, delete pages (✕ button or Delete key), undo/redo stack capped at 50 (Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z), Reset clears stack and restores source state. State model: `{ sourceIndex, rotation }[]`; output uses `page.setRotation(degrees(r))` so text stays selectable. Page thumbnails rendered by `pdfjs-dist/legacy/build/pdf.mjs` with IntersectionObserver lazy loading and CSS `transform: rotate()` to reflect user-applied rotation state visually. Uses the same `window.__PDF_WORKER_URL__` pattern as pdf-splitter for the pdfjs worker URL (see that entry). Sibling-module pattern; `pdf-lib` + `pdfjs-dist`.
- `pdf-merger.html` + `pdf-merger.js` — PDF merger: drop 2+ PDFs (and optionally PNG/JPEG/WebP images promoted to A4 pages) onto a drop zone; each file becomes a card in a horizontally-scrollable strip showing filename, page count, file size, a per-file page range input (e.g. `1-3, 7, 9-`), and a drag handle for reordering. Output controls: editable filename, "Add bookmarks per source" toggle (writes a top-level outline entry per input file via pdf-lib's low-level context API), "Strip metadata" toggle (clears Title/Author/Creator/Producer/Subject/Keywords). Uses `pdf-lib` (MIT) for all PDF reads/writes. Sibling-module pattern (pdf-lib bare-specifier import). Note: `pdfjs-dist` is used by `pdf-splitter` and `pdf-page-manager` for thumbnails (see those entries). The merger uses placeholder emoji instead because cards only need the page count, not a visual preview — this keeps the bundle smaller and the cards load faster. If thumbnails are ever added here, use `pdfjs-dist/legacy/build/pdf.mjs` (non-legacy build has embedded webpack source-map paths Parcel can't resolve) and set `workerSrc` via `window.__PDF_WORKER_URL__` — see the pdf-splitter entry for the full `scripts/build.mjs` copy + placeholder-injection pattern. Do not use `url:` or `new URL()` for the worker.
- `image-to-pdf.html` + `image-to-pdf.js` — Image to PDF: drop 1+ PNG / JPEG / WebP images into a drag-reorderable grid; each becomes one PDF page. Toolbar pills cover page size (Auto / A4 / Letter / Legal / Custom with pt/mm/in unit toggle), orientation (Auto / Portrait / Landscape — Auto matches each image's longer edge), fit (Contain / Cover / Stretch), margin (0 / 10 / 20 mm / Custom mm), background (White / Transparent, with a warn-bar reminding viewers render transparent pages as black), and an editable filename. Auto page mode treats each image at 72 DPI so 1 px == 1 pt and ignores fit/margin (each page is exactly the image size). pdf-lib only — JPEG → `embedJpg` (lossless), PNG → `embedPng` (lossless), WebP → re-encoded to PNG via `<canvas>` (browsers can decode WebP but pdf-lib doesn't accept it natively). Sibling-module pattern.
- `pdf-compressor.html` + `pdf-compressor.js` — PDF compressor: drop up to 25 PDFs into a horizontally-scrollable queue; each card shows filename, original size, a status badge (queued / working / done / skipped / error), and after running, a before/after stats row with a `.delta-good`/`.delta-bad` chip. Quality preset pills (Lossless q=0.92 / Visually identical q=0.85 default / Smaller q=0.70 / Smallest q=0.50), a "Downscale large images" switch with a long-edge pixel threshold (default 2000 px), a "Strip metadata" switch (default on — clears Title/Author/Subject/Keywords/Creator/Producer), and a filename pattern select (`{name}.pdf` overwrite or `{name}-compressed.pdf`). Per-file Download + Download all (zip) via the shared `buildStoreZip` helper. **v1 implementation**: walks pdf-lib's indirect-object map (`ctx.enumerateIndirectObjects()`), finds every `PDFRawStream` whose `/Subtype` is `/Image` and whose last `/Filter` is `/DCTDecode`, decodes with `createImageBitmap`, re-encodes via `OffscreenCanvas.convertToBlob('image/jpeg', q)`, and assigns the replacement stream back to the same `PDFRef` so an image deduplicated across pages is only re-encoded once. Skips CMYK / DeviceN JPEGs (`createImageBitmap` support is unreliable), image masks, and any stream where the re-encode came out larger than the source. Save uses `{ useObjectStreams: true }`. Text glyphs, fonts, content streams, and annotations are untouched — output text stays selectable. Sibling-module pattern, pdf-lib only (no pdfjs-dist). **Out of scope for v1**: target-size binary search, page rasterization (Path B), FlateDecode+raw-RGB image streams, and JBIG2/JPX/CCITT re-encoding.

## Stack

- **Bundler**: Parcel 2 (`npm run dev` for dev server, `npm run build` for production)
- **CSS**: Tailwind CSS v4 via PostCSS (`styles.css` is the shared stylesheet)
- **No JS framework** — vanilla JS inline in each HTML file
- **No npm packages at runtime** — devDependencies only

## Adding a new tool

1. Copy `src/_tool-template.html` to `src/<slug>.html` and replace every `@@PLACEHOLDER@@` token (tool name, slug, icon, max-width, subtitle). The template has the correct partial order, sentinel comments, and footer position already in place — do not rearrange them.
2. Add an entry for the tool in `src/tools.json` (`slug`, `name`, `icon`, `category`, `card`, `description`, `faqs`). `card` is a short one-liner shown on the index card; `description` is the full SEO text. Then run `npm run generate:sections` to write the FAQ block, "More tools" cross-link block, and JSON-LD structured data into `src/<slug>.html` (and refresh every other tool's "More tools" list so the new tool shows up there too). Run `npm run generate:index` to add the tool card to `index.html`. Also run `npm run generate:favicon` to rasterize the tool's emoji into `src/favicon-<slug>.png` and commit it.
3. Include shared partials in `<head>` — see "Shared HTML partials" below. The minimum head is `meta-base` + per-page meta + `meta-social` + per-page icon (`<link rel="icon" type="image/png" sizes="32x32" href="favicon-<slug>.png">`) + `head-fonts` + `<link rel="stylesheet" href="styles.css">` + optional per-page `<style>` + `head-theme`.
4. Include the shared site header at the top of `<body>` with a `<nav aria-label="Breadcrumb">` linking back to `index.html` — copy the header block from an existing tool. Mark the current page span with `aria-current="page"`. See "Semantic landmarks" below.
5. Wrap the tool UI in `<main class="…">` (exactly one `<main>` per page). Inside, the page heading goes in an `<h1>` that matches the tool name.
6. The template already contains the correct footer markup and `<include src="_partials/footer-script.html"></include>`. Do not move them — the required order is: `</main>` → optional module `<script>` → `footer-script` include → FAQ sentinel → more-tools sentinel → `<footer>`. The footer-script partial uses a `"__BUILD_TIME__"` placeholder that `scripts/build.mjs` replaces with the real ISO timestamp.
7. Run `npm run generate:index` to insert the tool card into `index.html` automatically (the script reads `tools.json` and regenerates the sentinel-wrapped grid). Update the "Current tools" list in `AGENTS.md` and add a row for the new tool in the tools table in `README.md`.
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

## Pull request rules

- **Every PR must include a `Closes #<issue_number>` line** in the PR description (or the commit message that lands on `main`) so GitHub auto-closes the linked issue on merge. If there is no related issue, omit the line — don't invent a number.
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
- Per-tool logic stays in an inline `<script>` at the bottom of each HTML file (see "Adding a new tool" step 9). Only **shared** helpers (`theme.js`, `json-utils.js`, `image-utils.js`) live as separate hashed bundles so they cache once across the suite. **Exception:** if the tool needs `import` / `import()` from an npm package (like `snippet-to-image` does for Shiki), put the body in a sibling `src/<slug>.js` and reference it via `<script type="module" src="<slug>.js"></script>`. Parcel won't code-split bare-specifier imports out of an inline module — it minifies the body in place and leaves the imports unresolved.
- Parcel's default resolver needs `@parcel/resolver-default.packageExports: true` in `package.json` to honor the `exports` field of npm packages — it's already enabled at the root and must stay enabled for any tool that imports from subpath entries (`@shikijs/themes/github-dark`, etc.).

## Design system

Shared UI components live in `src/styles.css` (the "Shared components" block at the end) and are catalogued in **`src/design-system.html`** — a contributor reference page reachable at `/design-system.html`. It's marked `"internal": true` in `tools.json` so it's intentionally **not** linked from the index, included in the sitemap, or referenced in the "More tools" cross-link block. Both `scripts/build.mjs` and `scripts/generate-sections.mjs` derive their `INTERNAL_PAGES` set from that flag.

When building a new tool:

1. **Reach for the catalogued classes first** — `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-active` / `.btn-sm` / `.btn-icon` (icon-only square — equal padding, `aspect-ratio: 1`; combine with a size modifier: `.btn.btn-icon` regular, `.btn.btn-sm.btn-icon` compact), `.tab-btn`, `.pill` / `.pill-sm` / `.pill.on`, `.chip`, `.input` / `.input-mono`, `.textarea`, `.num-input`, `.select`, `.switch` (pill toggle — `<label class="switch"><input type="checkbox"><span>Label</span></label>`; use for a single binary state, not multi-select option lists — those stay regular checkboxes), `.range`, `.swatch`, `.drop-zone` (with `.compact` and `.dragover`), `.card` / `.card-lift`, `.file-card`, `.toolbar` (options strip — flex row of `<label>`s wrapping `.select` / `.num-input` / checkbox controls), `.disclosure` (markup: `<details class="disclosure"><summary>…</summary><div class="disclosure-content"><div class="disclosure-body">…</div></div></details>`), `.tooltip` (markup: `<span class="tooltip" tabindex="0"><span class="tooltip-trigger" aria-hidden="true">i</span><span class="tooltip-text" role="tooltip">…</span></span>` — keep popups under ~240 px, one or two sentences), `.cheat-table`, `.loader` (pulsing SVG icon + cycling text + wave dots — markup: `<p class="loader hidden" role="status" aria-live="polite"><svg class="loader-icon" …><circle …/><circle … class="loader-pulse-ring"/></svg><span class="loader-msg">Loading</span><span class="loader-dots" aria-hidden="true"><span></span><span></span><span></span></span></p>`; show with `.classList.remove('hidden')`; cycle text with `startLoader(el, msgs)` helper which returns `{ stop() }` — see design-system.html for the full snippet), `.error-bar` / `.warn-bar`, `.stats` + `.delta-good` / `.delta-bad` / `.delta-neutral`, `.thumb-box` / `.thumb-label`, `.diff-wrap` / `.diff-handle` / `.diff-slider` / `.diff-tag`, plus the JSON tree primitives (`.json-key`, `.json-string`, `.json-number`, `.json-bool`, `.json-null`, `.json-punct`, `.tree-row`, `.toggle-btn`, `.tree-children`).
2. **If the pattern doesn't exist yet**, decide whether it's *generic* or *tool-specific*:
   - **Generic primitives** (a toggle switch, a tabs strip, a tooltip, a modal — anything you'd reasonably expect a second tool to want) go into `src/styles.css` and `design-system.html` **the first time you build them**, even if only one tool uses them today. Document on day one rather than later.
   - **Tool-specific shapes** (the regex pattern row, the JSON tree, the wave generator's preview) stay inline. Promote them only once a second tool needs them.

   When in doubt, ask: "would a stranger building a new tool reach for this without hesitation?" If yes, it's generic — catalogue it now.
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

## Favicons

Each tool has a 32×32 PNG favicon rasterized from its `tools.json` emoji, plus a site-wide fallback `src/favicon.png` (🛠️) referenced from `_partials/meta-base.html`. The PNGs live in `src/favicon-<slug>.png` (and `src/favicon.png`) and are committed to the repo; Parcel picks them up via per-page `<link rel="icon" type="image/png" sizes="32x32" href="favicon-<slug>.png">`.

Rerun `npm run generate:favicon` whenever a tool's icon changes or a new tool is added to `tools.json`, then commit the regenerated PNGs. The generator reads Twemoji SVGs from `node_modules/@twemoji/svg` (no network at run time) and renders them with Resvg.

When adding a new tool, after registering it in `tools.json` and running `npm run generate:favicon`, point the per-page `<link rel="icon">` at the new `favicon-<slug>.png`.

## Commands

```bash
npm run dev                 # start dev server (watches all *.html)
npm run build               # production build → dist/
npm run preview             # serve dist/ locally to spot-check the production build
npm run generate:og         # regenerate src/og-image.png from src/og-image.svg
npm run generate:favicon    # regenerate src/favicon*.png from tools.json emojis
npm run generate:index      # rewrite the tool-grid sentinel in src/index.html from src/tools.json
npm run generate:sections   # rewrite FAQ / More tools / JSON-LD blocks in src/*.html from src/tools.json
```
