# UI Conventions

## Syntax highlighting in code snippets

Pages that need syntax-highlighted `<pre>` code blocks (contributor docs, design system, etc.) use **Shiki** (`@shikijs/core` + `@shikijs/engine-javascript`) via the **sibling-module pattern** — the highlighting logic must live in a separate `src/<slug>.js` file because Parcel won't resolve bare-specifier npm imports from inline `<script type="module">` blocks.

**Step-by-step:**

1. Create `src/<slug>.js` with Shiki initialization. Eager-import only the languages/themes your page actually needs; add a `fetchLang`/`fetchTheme` switch with dynamic `import()` if the page supports user-selectable options (like snippet-to-image). For a static page that only needs `html` + `javascript`:

```js
import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import langHtml from '@shikijs/langs/html';
import langJs from '@shikijs/langs/javascript';
import themeGithubDark from '@shikijs/themes/github-dark';

(async () => {
  const hl = await createHighlighterCore({
    themes: [themeGithubDark], langs: [langHtml, langJs],
    engine: createJavaScriptRegexEngine(),
  });
  document.querySelectorAll('pre').forEach(pre => {
    const code = pre.textContent;
    if (!code.trim()) return;
    const lang = code.trimStart().startsWith('<') ? 'html' : 'javascript';
    try {
      const rendered = hl.codeToHtml(code, { lang, theme: 'github-dark' });
      const tmp = document.createElement('div');
      tmp.innerHTML = rendered;
      const inner = tmp.querySelector('code');
      if (inner) pre.innerHTML = inner.innerHTML; // keeps existing <pre> classes
    } catch {}
  });
})();
```

2. Reference it in the HTML page **before** any regular `<script>` that modifies the DOM:

```html
<script type="module" src="<slug>.js"></script>
<script>/* existing inline JS */</script>
```

3. Import from `@shikijs/core` (not `shiki/core`) — Parcel's resolver doesn't follow Shiki's conditional export map under the `unwasm` condition.

4. `pre.textContent` after `innerHTML` replacement still returns the plain code text (the browser concatenates text nodes, ignoring `<span>` tags), so copy-to-clipboard logic that reads `pre.textContent` continues to work unmodified.

## Hide unusable buttons, don't grey them out

If a button would do nothing when clicked, **remove it from the DOM** (toggle a `hidden` class) rather than rendering it `disabled`. A greyed-out button still occupies space and invites the user to wonder *why* — that's confusing in tools where the available actions vary with state.

Apply this rule to:

- **Batch-only affordances** when only one file is loaded — "Save all (zip)", "Apply to all files", etc. With a single file they're literal no-ops; hide them entirely. Show them only once `items.length >= 2`. Toggle a parent-container class (e.g. `is-batch`) so grid layouts can reclaim the column the button left behind, instead of leaving an empty gutter.
- **Suggestion / smart-fill triggers** when no file would actually change — e.g. the MP3 Tag Editor's "Smart fill all" button hides itself when zero files have a fillable filename match. Same for the toggles that gate it: hide a "Include uncertain guesses" switch when there are no uncertain matches to toggle in or out.
- **Context actions** that depend on a piece of state — e.g. "Remove" on a thumbnail when the slot is already empty, "Undo" when the stack is empty.

Exception: **transient disabled states during async work** (e.g. a Save button while a `writer.addTag()` runs, an Apply button mid-encode) should stay visible and use `disabled` plus a status string ("Writing…"). Those are *in-progress*, not *unusable* — the user is waiting for that exact button to come back, so removing it would feel like the page broke.

## Emoji conventions

Emojis remain part of the site's visual language, but the **SVG sprite takes priority for action buttons**.

### Action buttons — SVG first, emoji fallback

1. **Check the sprite first.** If a suitable icon exists in `src/_partials/icons.html`, use it — even for labeled buttons:
   ```html
   <button class="btn btn-secondary">
     <svg class="icon" aria-hidden="true"><use href="#icon-copy"/></svg> Copy
   </button>
   ```
   Available action icons: `icon-copy`, `icon-download`, `icon-trash`, `icon-search`, `icon-rotate-cw`, `icon-rotate-ccw`, `icon-undo`, `icon-redo`.

2. **If no sprite icon fits, use an emoji prefix** for the label: 📋 Copy, ⬇️ Download, 🗑️ Clear, ↩️ Reset, ✨ Prettify, 🗜️ Minify, 🆚 Compare, 🌳 Tree, 📄 Raw, 📥 Load sample, 🔄 Re-encode, 🎲 Random, ▶️ Animate, 🔀 Shuffle. When picking a new glyph, choose one that reads at-a-glance — it's a navigational anchor, not decoration.

3. **Icon-only `btn-icon` buttons always use the SVG sprite** — never emoji. See the Design System section for `.btn-icon` usage.

4. **Adding a new icon**: if the needed action has no sprite match and you'd use the same icon in more than one place, add a `<symbol>` to `src/_partials/icons.html` and update the icon table in `.ai/DESIGN_SYSTEM.md` rather than repeating the emoji across pages.

### Other emoji rules

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
