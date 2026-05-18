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
