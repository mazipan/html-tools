---
description: Add a new shared component to the design system — styles.css (dark + light), design-system.html (TOC + section), and .ai/DESIGN_SYSTEM.md
argument-hint: <component-name> [brief description or usage note]
allowed-tools: Bash, Read, Edit, Write
---

Add a new shared component to the HTML Tools design system.

Component brief: **$ARGUMENTS**

Follow this checklist in order. Do not skip steps.

---

## 1. Understand the component

Parse `$ARGUMENTS`:
- First token or quoted phrase → component name / CSS class (e.g. `badge`, `progress-bar`)
- Remainder → usage description or design intent

If the brief is ambiguous on any of these, use `AskUserQuestion` (≤ 2 questions) before touching any file:
- What HTML element / markup should it use? (e.g. `<span>`, `<div>`, `<button>`)
- Which semantic variants are needed, if any? (e.g. `*-done`, `*-error`, `*-warn`)

---

## 2. Read the codebase

Read these files in full before writing anything:

```bash
# Understand existing components and insertion points
grep -n "/\* ── " src/styles.css          # component section headers
grep -n "html\[data-theme" src/styles.css | head -20  # light-mode override pattern
grep -n "ds-section\|ds-toc-list\|<h3>" src/design-system.html | head -40
```

Also read the nearest related component's CSS block (e.g. if adding a badge-like thing, read `.chip`; if adding a layout primitive, read `.card`) so the new component's style language is consistent.

---

## 3. Design the CSS

Design the dark-mode (default) styles first. Rules:
- Use `#0b1220` for surface backgrounds, `#1f2937` for borders, `#9ca3af` for muted text
- Use `var(--accent)` / `var(--accent-h)` for highlighted / active states — never hardcode `#3b82f6`
- Use `color-mix(in srgb, var(--accent) N%, transparent)` for tinted accent backgrounds
- Semantic status colors: good `rgba(16,185,129,…)/#34d399`, warn `rgba(217,119,6,…)/#fbbf24`, error `rgba(239,68,68,…)/#f87171`

Design the light-mode overrides next. Rules:
- Swap dark surfaces to light: `#0b1220` → `#ffffff` or `#f9fafb`, `#1f2937` → `#f3f4f6` (border → `#e5e7eb`, `#d1d5db`)
- Swap muted text: `#9ca3af` → `#6b7280`
- Swap semantic colors to accessible light equivalents: good `#059669`, warn `#d97706`, error `#dc2626`
- Use `color-mix(in srgb, var(--accent) N%, #ffffff)` for tinted backgrounds (not transparent)
- Every dark-mode rule that hardcodes a color needs a light-mode counterpart

---

## 4. Insert dark-mode CSS into `src/styles.css`

Find the right insertion point:
- Insert **after** the most semantically related existing component block (chips → badges, card → file-card, etc.)
- Open the section with a comment: `/* ── ComponentName ──────────… */`
- Follow the 80-char ruler style used by neighbours

Example pattern:
```css
/* ── MyComponent ────────────────────────────────────── */
/* One-line intent note if non-obvious. */
.my-component {
  /* base styles */
}
.my-component-variant-a { /* … */ }
.my-component-variant-b { /* … */ }
```

---

## 5. Insert light-mode overrides into `src/styles.css`

Find where the nearest related component's light-mode overrides live (grep for `html\[data-theme="light"\] .related-class`). Insert the new component's overrides **immediately after** that cluster, keeping the file's per-component grouping intact.

Example:
```css
html[data-theme="light"] .my-component          { background: #f3f4f6; color: #374151; }
html[data-theme="light"] .my-component-variant-a { background: …; color: …; }
```

If no related component exists, append the new overrides just before the final `html[data-theme="light"]` rule in the file.

---

## 6. Add the TOC link in `design-system.html`

Open `src/design-system.html` and find `<div id="ds-toc-list">`. Pick the right `<h3>` group:
- **Forms** — interactive controls (buttons, inputs, pills, chips, etc.)
- **Layout & content** — structural containers (cards, toolbar, disclosure, etc.)
- **Feedback** — status, loaders, alerts, progress (badges, error bars, stats, etc.)

Insert `<a href="#component-id">Component Name</a>` in alphabetical order within its group.

---

## 7. Add the documentation section in `design-system.html`

Insert a new `<section id="component-id" class="ds-section">` block **before** the section that immediately follows it in the TOC. Follow this template exactly:

```html
<!-- ComponentName -->
<section id="component-id" class="ds-section">
  <h2>ComponentName</h2>
  <p class="lead">One-sentence description of when to reach for this component and what it does.</p>
  <div class="ds-row flex-wrap gap-2 my-3">
    <!-- live demo: at least 2–4 representative examples -->
    <span class="my-component">default</span>
    <span class="my-component my-component-variant-a">variant a</span>
  </div>
  <div class="ds-snippet">
    <button class="copy" type="button">Copy</button>
<pre>&lt;span class="my-component"&gt;default&lt;/span&gt;
&lt;span class="my-component my-component-variant-a"&gt;variant a&lt;/span&gt;</pre>
  </div>
</section>
```

Rules:
- The `<pre>` content must be valid HTML that a developer can copy verbatim
- Include at least one note in `<p class="lead">` about when to use vs. a similar component (e.g. "use `.badge` for read-only status; reach for `.chip` when the label is an action trigger")
- If the component has required children or ARIA attributes, show them in the snippet

---

## 8. Update `.ai/DESIGN_SYSTEM.md`

In the "Reach for the catalogued classes first" bullet (step 1 of "When building a new tool"), insert the new class name and a brief usage parenthetical in the right alphabetical/logical position within the existing list. Keep it terse — one phrase like:

```
`.my-component` (read-only status pill — use `<span>`; pair with a variant: `.my-component-done` / `.my-component-error`)
```

---

## 9. Verify

Run `npm run build` and confirm it exits cleanly:

```bash
npm run build 2>&1 | grep -E "Error|error|🎉" | tail -5
```

If the build fails, fix the issue before reporting.

---

## 10. Report

List exactly what changed (file + what was added/modified), note the insertion points, and confirm both dark and light modes are covered. Do **not** commit — that's `/ship`'s job.
