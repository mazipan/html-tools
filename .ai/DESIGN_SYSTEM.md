# Design System

Shared UI components live in `src/styles.css` (the "Shared components" block at the end) and are catalogued in **`src/design-system.html`** — a contributor reference page reachable at `/design-system.html`. It's marked `"internal": true` in `tools.json` so it's intentionally **not** linked from the index, included in the sitemap, or referenced in the "More tools" cross-link block. Both `scripts/build.mjs` and `scripts/generate-sections.mjs` derive their `INTERNAL_PAGES` set from that flag.

When building a new tool:

1. **Reach for the catalogued classes first** — `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-active` / `.btn-sm`, `.btn-icon` (standalone icon-only square button — fixed `2rem × 2rem`, no padding; always pair with a variant: `ghost` subtle outline primary danger; add `.btn-icon-sm` for `1.5rem` compact size; use SVG icons inside — see "SVG icon sprite" below: `<button class="btn-icon ghost"><svg class="icon" aria-hidden="true"><use href="#icon-rotate-cw"/></svg></button>`), `.tab-btn`, `.pill` / `.pill-sm` / `.pill-sm.is-square` / `.pill.on`, `.chip`, `.angle-dial` (circular drag-to-rotate control — markup: `<div class="angle-dial" role="slider" tabindex="0" aria-label="…" aria-valuemin="-180" aria-valuemax="180" aria-valuenow="0"><svg>…</svg><div class="angle-dial-readout">0°</div></div>`; JS updates `x2`/`cx`/`cy` on the hand/knob elements using `x = cx + R·sin(θ)`, `y = cy − R·cos(θ)` where R = 23; supports arrow-key ±1°/±10° and touch drag — see `image-watermark.html` for the full hook-up), `.badge` (read-only status pill — use `<span>`, not `<button>`; always pair with a semantic variant: `.badge-queued` / `.badge-working` / `.badge-done` / `.badge-warn` / `.badge-error`), `.icon` (SVG icon from the sprite — `1em × 1em`, inherits `color` via `currentColor`; see "SVG icon sprite" below), `.input` / `.input-mono`, `.textarea`, `.num-input`, `.select`, `.switch` (pill toggle — `<label class="switch"><input type="checkbox"><span>Label</span></label>`; use for a single binary state, not multi-select option lists — those stay regular checkboxes), `.range`, `.swatch`, `.drop-zone` (with `.compact` and `.dragover`), `.card` / `.card-lift`, `.file-card`, `.toolbar` (options strip — flex row of `<label>`s wrapping `.select` / `.num-input` / checkbox controls), `.disclosure` (markup: `<details class="disclosure"><summary>…</summary><div class="disclosure-content"><div class="disclosure-body">…</div></div></details>`), `.tooltip` (markup: `<span class="tooltip" tabindex="0"><span class="tooltip-trigger" aria-hidden="true">i</span><span class="tooltip-text" role="tooltip">…</span></span>` — keep popups under ~240 px, one or two sentences), `.cheat-table`, `.color-btn` (styled `<label>` wrapping `<input type="color">` — shows a larger swatch preview + hex readout as a clickable row; set `--color-btn-c` inline style to sync the swatch; update it and the `.color-btn-hex` text on `input` events — see `image-watermark.html` for the hook-up), `.loader` (pulsing SVG icon + cycling text + wave dots — markup: `<p class="loader hidden" role="status" aria-live="polite"><svg class="loader-icon" …><circle …/><circle … class="loader-pulse-ring"/></svg><span class="loader-msg">Loading</span><span class="loader-dots" aria-hidden="true"><span></span><span></span><span></span></span></p>`; show with `.classList.remove('hidden')`; cycle text with `startLoader(el, msgs)` helper which returns `{ stop() }` — see design-system.html for the full snippet), `.error-bar` / `.warn-bar`, `.stats` + `.delta-good` / `.delta-bad` / `.delta-neutral`, `.thumb-box` / `.thumb-label`, `.diff-wrap` / `.diff-handle` / `.diff-slider` / `.diff-tag`, plus the JSON tree primitives (`.json-key`, `.json-string`, `.json-number`, `.json-bool`, `.json-null`, `.json-punct`, `.tree-row`, `.toggle-btn`, `.tree-children`).
2. **If the pattern doesn't exist yet**, decide whether it's *generic* or *tool-specific*:
   - **Generic primitives** (a toggle switch, a tabs strip, a tooltip, a modal — anything you'd reasonably expect a second tool to want) go into `src/styles.css` and `design-system.html` **the first time you build them**, even if only one tool uses them today. Document on day one rather than later.
   - **Tool-specific shapes** (the regex pattern row, the JSON tree, the wave generator's preview) stay inline. Promote them only once a second tool needs them.

   When in doubt, ask: "would a stranger building a new tool reach for this without hesitation?" If yes, it's generic — catalogue it now.
3. **Don't redefine a catalogued class inline.** If the existing definition doesn't fit, fix it in `styles.css` so every tool benefits — or open an issue to discuss before forking the pattern. In particular: never hardcode `#3b82f6` / `#1e3a8a` for "active" states — use `var(--accent)` / `var(--accent-h)` (or just inherit them via the shared class) so the accent swatch in the tweaks panel actually recolors the page.

The textareas in the JSON-family tools still use ad-hoc Tailwind (`w-full h-[500px] … p-4 leading-relaxed`) instead of `.textarea` because the shared class has tighter padding/line-height suited for one-line inputs, not the code-editor surface those tools need. If a third tool adopts the same pattern, promote a `.textarea-code` (or similar) variant rather than continuing to inline.

## SVG icon sprite

A curated set of stroke-based SVG icons lives in `src/_partials/icons.html` as an inline `<svg style="display:none">` sprite. Include it **once per page** at the top of `<body>`:

```html
<body …>
  <include src="_partials/icons.html"></include>
  …
```

Render any icon using the `.icon` CSS class (sizes to `1em × 1em`, inherits `color` via `stroke="currentColor"`):

```html
<svg class="icon" aria-hidden="true"><use href="#icon-NAME"/></svg>
```

Available icon IDs (all `viewBox="0 0 24 24"`, stroke-based):

| Category | IDs |
|---|---|
| Directional arrows | `icon-arrow-up` `icon-arrow-down` `icon-arrow-left` `icon-arrow-right` |
| Chevrons | `icon-chevron-up` `icon-chevron-down` `icon-chevron-left` `icon-chevron-right` |
| Close | `icon-x` |
| Rotation | `icon-rotate-cw` `icon-rotate-ccw` |
| History | `icon-undo` `icon-redo` |
| Actions | `icon-trash` `icon-copy` `icon-download` `icon-search` |

Rules:
- **Add new icons to the sprite** — never inline a one-off `<svg>` path in tool markup. If a needed icon isn't in the table, add a `<symbol>` to `src/_partials/icons.html` and document it here.
- **Always include the sprite** in any page that references icon IDs. Referencing `#icon-X` in JS-generated HTML works fine as long as the sprite is in the DOM.
- **Use `aria-hidden="true"`** on the `<svg>` element; rely on the parent button's `title` or `aria-label` for the accessible name. Don't put text inside `.btn-icon` buttons — the icon is the whole content.
