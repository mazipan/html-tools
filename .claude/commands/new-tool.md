---
description: Scaffold a new tool following AGENTS.md "Adding a new tool"
argument-hint: <slug> [tool name]
allowed-tools: Bash, Read, Edit, Write, Glob
---

Scaffold a new tool with slug **$ARGUMENTS**. Treat the first whitespace-separated token as the slug; the rest (if any) is the human-readable name. If only a slug is provided, ask the user for the display name, emoji icon, and category before proceeding.

Follow AGENTS.md "Adding a new tool" exactly — this command is a runner for that checklist, not a replacement. Do every step:

1. **Pick a reference tool** that's structurally closest to what's being built (e.g. `src/json-sort.html` for a JSON-text tool, `src/image-resizer.html` for an image tool, `src/regex-tester.html` for a single-input live tool). Read it in full so you copy the right partials, semantic landmarks, and inline-script pattern. Do **not** invent a new skeleton.

2. **Create `src/<slug>.html`** by adapting the reference. Required pieces:
   - `<head>`: `meta-base` partial, per-page `<title>` + `<meta name="description">` + Open Graph + Twitter tags, `meta-social` partial, `<link rel="icon" ... href="favicon-<slug>.png">`, `head-fonts` partial, `<link rel="stylesheet" href="styles.css">`, optional per-page `<style>`, `head-theme` partial last.
   - `<body>`: site header with `<nav aria-label="Breadcrumb">` linking back to `index.html`, current page span marked `aria-current="page"` and prefixed with the tool's emoji.
   - Exactly one `<main>`, exactly one `<h1>` matching the tool name (with emoji prefix).
   - Footer with `&copy; <span id="year"></span> Irfan Maulana<span id="deploy-time"></span>` and `<include src="_partials/footer-script.html"></include>`.
   - Inline `<script>` at the bottom for all tool logic.

3. **Register in `src/tools.json`** with `slug`, `name`, `icon` (emoji), `category`, `description`, and 3–5 genuine `faqs` (`{q, a}`). Do not set `internal: true` unless the user explicitly asks for a contributor-only page.

4. **Reach for catalogued classes from the design system** (`src/styles.css` + `src/design-system.html`) — `.btn`, `.btn-primary`, `.input`, `.textarea`, `.select`, `.toolbar`, `.drop-zone`, `.card`, `.disclosure`, etc. Don't redefine these inline. If a generic primitive is missing, promote it into `styles.css` + `design-system.html` rather than forking.

5. **Add a card to `src/index.html`** under the correct category section. Match the existing card markup exactly (icon, name, one-line description, link).

6. **Run the generators** in order:
   ```bash
   npm run generate:favicon    # rasterizes the new emoji to src/favicon-<slug>.png
   npm run generate:sections   # writes FAQ, More tools, JSON-LD blocks into src/*.html
   ```
   Both update every tool page that references the new tool — review the diff before continuing.

7. **Update docs**: add a bullet to the "Current tools" list in `AGENTS.md` and a row in the tools table in `README.md`. Keep wording terse and consistent with neighbours.

8. **Sanity check**: `npm run build` must succeed before stopping. Run it.

9. **Verify in browser**: start `npm run dev` in the background and load `http://localhost:1234/<slug>.html` to confirm the page renders, the breadcrumb works, the favicon loads, and the FAQ / "More tools" blocks appear. Test the golden path of the tool itself. Type checking is not a substitute — if you can't actually exercise the UI, say so explicitly.

10. **Stop and report**: list the files changed. Don't commit — that's `/ship`'s job.

Emoji conventions matter on this site (action buttons get glyphs: 📋 Copy, ⬇️ Download, 🗑️ Clear, etc.). Re-read the "Emoji conventions" section of AGENTS.md before writing button labels.
