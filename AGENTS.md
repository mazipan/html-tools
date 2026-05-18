# Agent Guidelines — HTML Tools

> ⚠️ Before you start, skim [`COMMON_BUGS.md`](COMMON_BUGS.md) — it lists non-obvious footguns from project conventions (e.g. `image-utils.js` is a classic script, not an ES module). One read is enough to skip a class of "the button silently does nothing" debugging.

## Project overview

A collection of single-file browser-native utilities built with Parcel + Tailwind CSS v4. Each tool is a self-contained HTML file; all logic runs client-side with no backend.

For the full list of current tools and shared modules, see [`TOOLS.md`](TOOLS.md).

## Stack

- **Bundler**: Parcel 2 (`npm run dev` for dev server, `npm run build` for production)
- **CSS**: Tailwind CSS v4 via PostCSS (`styles.css` is the shared stylesheet)
- **No JS framework** — vanilla JS inline in each HTML file
- **No npm packages at runtime** — devDependencies only

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

## Further reading

@TOOLS.md
@CONTRIBUTING.md
@DESIGN_SYSTEM.md
@UI_CONVENTIONS.md
@CONVENTIONS.md
