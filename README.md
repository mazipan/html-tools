# HTML Tools

A collection of single-file browser-native utilities. All logic runs client-side — no backend, no accounts, no data leaves your browser.

[![Netlify Status](https://api.netlify.com/api/v1/badges/cae5f45f-a109-49d5-aa45-2f07f4be1c45/deploy-status)](https://app.netlify.com/projects/mzp-html-tools/deploys)

🌐 **Live:** http://tools.mazipan.space/

## Tools

| Tool | Description |
|------|-------------|
| [JSON Formatter](src/json-formatter.html) | Prettify, minify, and validate JSON with syntax highlighting |
| [JSON → TypeScript](src/json-to-ts.html) | Convert a JSON object into TypeScript interfaces |
| [JSON Diff](src/json-diff.html) | Compare two JSON objects and highlight differences |
| [JSON Sort](src/json-sort.html) | Sort JSON object keys alphabetically, recursively |
| [JSON ↔ CSV](src/csv-to-json.html) | Round-trip JSON and CSV with smart type inference and delimiter detection |
| [JSON ↔ YAML](src/json-to-yaml.html) | Round-trip JSON and YAML with anchor resolution and multi-document support |
| [Regex Tester](src/regex-tester.html) | Test JavaScript regular expressions live with capture-group breakdown |
| [SVG → JSX](src/svg-to-jsx.html) | Convert SVG markup to React JSX |
| [Image Format Converter](src/image-converter.html) | Re-encode images between PNG, JPEG, WebP, and AVIF with a quality slider and visual diff |
| [Gradients](src/gradients.html) | Curated gradient gallery — copy CSS, Tailwind, or export PNG |
| [Blob Generator](src/blob.html) | Generate organic blob shapes via CSS border-radius or SVG path |
| [Wave Generator](src/waves.html) | Generate SVG wave dividers — single wave or stacked layers |

## Development

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # production build → dist/
```

Requires Node 24+ (see `.nvmrc`).

## Stack

- [Parcel 2](https://parceljs.org/) — zero-config bundler
- [Tailwind CSS v4](https://tailwindcss.com/) — utility-first CSS
- Vanilla JS — no runtime framework

## Adding a new tool

See [AGENTS.md](AGENTS.md) for the full checklist.
