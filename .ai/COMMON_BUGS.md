# Common bugs

A log of footguns we've already hit so future tools (and future agents) don't repeat them. Add to this file whenever you spend more than a few minutes tracking down a non-obvious bug — especially one that comes from a project convention rather than a typical JS mistake.

Each entry is one short section: what broke, why, and how to do it right.

---

## `image-utils.js` is a classic script, not an ES module

**Symptom**: A new tool's sibling-module `.js` imports from `./image-utils.js`, the build succeeds, the page loads with no console errors at startup — but the moment the user picks files or clicks a button that triggers the first call into a shared helper (`formatBytes`, `buildStoreZip`, etc.), nothing happens. The handler silently aborts because the imported binding is `undefined`.

**Why**: `src/image-utils.js` declares its functions as plain `function formatBytes(n) { … }` with **no `export` keyword anywhere**. It's loaded by other tools via a classic `<script src="image-utils.js"></script>` tag, which deposits the functions on `window`. When Parcel sees a module `import { formatBytes } from './image-utils.js'` against a script that has no ES exports, it produces a bundle where the import binding resolves to `undefined` — no compile error, no runtime warning, just an undefined value that throws "is not a function" the first time you call it. The throw happens inside an event listener, so the user only sees "the button doesn't work."

**How to do it right** (the pattern every existing tool uses — `image-compressor`, `image-converter`, `favicon-generator`):

1. In the tool's HTML, include image-utils.js as a classic script **before** the module script:
   ```html
   <script src="image-utils.js"></script>
   <script type="module" src="my-tool.js"></script>
   ```
   Parcel will deduplicate it across tools and emit a single shared hashed chunk.

2. In the tool's `.js`, read the helpers off `window` (or just reference them as bare globals since modules can read globals):
   ```js
   // Loaded as classic-script globals from image-utils.js
   const { formatBytes, formatPct, buildStoreZip } = window;
   ```

3. **Don't** write `import { formatBytes } from './image-utils.js'` — that's the broken path.

If you're tempted to add `export` keywords to `image-utils.js` to make the imports work, also update every classic `<script src="image-utils.js">` callsite to a module load. Don't half-migrate.

---

## Tailwind v4's `.hidden` doesn't beat `.btn` (or any custom `display:` rule)

**Symptom**: A button is marked `class="btn btn-secondary hidden"` (or any combination of a component class + `hidden`), but it renders visibly anyway. JS that toggles the `hidden` class on a `.btn` element does nothing — `classList.toggle('hidden', true)` leaves the button on screen.

**Why**: Tailwind v4 emits its utilities **without** `!important` — `.hidden { display: none }` is a plain rule. The project's `src/styles.css` defines `.btn { display: inline-flex }` (and similar `display` declarations on other shared components). Because `styles.css` is processed **after** the Tailwind utility layer, its rules win on the cascade when specificity is equal. So `class="btn hidden"` ends up with `display: inline-flex`, not `display: none`.

**How to do it right**: `src/styles.css` now contains an explicit `.hidden { display: none !important; }` at the top of the Shared-components block. With that line in place, `class="… hidden"` reliably hides any element, including `.btn`. **Don't remove it**, and don't redefine `.hidden` elsewhere.

The general principle: any class that's meant to *override* the default presentation (e.g. `hidden`, `sr-only`, `invisible`) needs `!important` in this project as long as we keep shared-component CSS in the same file as Tailwind utilities. If you add another such utility, give it the same treatment.

---

## `parcel 'src/*.html'` picks up `_tool-template.html` and crashes dev

**Symptom**: `npm run dev` fails immediately with `Failed to resolve 'favicon-@@SLUG@@.png' from './src/_tool-template.html'`. The production build (`npm run build`) works fine because `scripts/build.mjs` filters underscored files; the dev script doesn't.

**Why**: `src/_tool-template.html` contains `@@PLACEHOLDER@@` tokens that aren't valid asset paths. The build script explicitly filters `!f.split('/').pop().startsWith('_')`; the dev script uses a raw `src/*.html` glob that includes the template.

**How to do it right**: The `dev` script uses `parcel 'src/[!_]*.html'` (extglob negation) so underscored files are skipped, matching the build script's filter. If you add a new underscored file under `src/` (e.g. another template), the same rule will already cover it.

---

## `.tab-btn` active state requires `.tab-btn-active`, not `.btn-active`

**Symptom**: A tab strip (`role="tablist"`) shows no visual active state — clicking tabs switches the content panel correctly but the selected tab button has no colored border-bottom underline. The initial tab also starts without the active style.

**Why**: There are two separate CSS classes:
- `.btn-active` (in the `.btn` family) — adds an accent background, intended for regular buttons not tab navigation
- `.tab-btn-active` — specific to `.tab-btn`; sets `color: #fff; border-bottom-color: var(--accent)` for the underline indicator

Using `.btn-active` on a `.tab-btn` applies the background-color rule but NOT the border-bottom, so the tab looks unselected. The fix is to use `.tab-btn-active` everywhere tabs are involved.

**How to do it right**:

In the HTML initial state:
```html
<!-- wrong -->
<button class="tab-btn btn-active" ...>Draw</button>
<!-- right -->
<button class="tab-btn tab-btn-active" ...>Draw</button>
```

In the JS `switchTab` function:
```js
// wrong
btn.classList.toggle('btn-active', k === tab);
// right
btn.classList.toggle('tab-btn-active', k === tab);
```

---

## `.pill-sm` is auto-width — use `.pill-sm.is-square` only for single-char labels

**Symptom**: Short multi-character labels like `-45°` or `90°` are clipped or overflow a `pill-sm` button, visually overlapping adjacent pills.

**Why**: `.pill-sm` was originally defined with `width: 28px; height: 28px; padding: 0` — a fixed square. At `0.85rem` monospace font, three characters already exceed 28 px and get clipped. The class was renamed/refactored: `.pill-sm` now only fixes the height (`28px`) and uses auto-width padding. The `.is-square` modifier (`width: 28px; padding: 0`) is for single-character or emoji labels where a square looks intentional (e.g. regex flags `g i m`).

**How to do it right**:
```html
<!-- labels with 2+ characters: just pill-sm -->
<button class="pill pill-sm" ...>45°</button>
<button class="pill pill-sm" ...>-45°</button>

<!-- single char / emoji where square is intentional -->
<button class="pill pill-sm is-square" ...>g</button>
```

---
