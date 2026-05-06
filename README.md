# HTML Tools

A collection of single-file browser-native utilities. All logic runs client-side — no backend, no accounts, no data leaves your browser.

Hosted at: https://internal.wego.com/hub/apps/html-tools/

## Tools

| Tool | Description |
|------|-------------|
| [JSON Formatter](src/json-formatter.html) | Prettify, minify, and validate JSON with syntax highlighting |
| [JSON → TypeScript](src/json-to-ts.html) | Convert a JSON object into TypeScript interfaces |
| [JSON Diff](src/json-diff.html) | Compare two JSON objects and highlight differences |
| [SVG → JSX](src/svg-to-jsx.html) | Convert SVG markup to React JSX |

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

## Deploying

Build first, then publish via the `/publish-to-wego-hub` skill (see [AGENTS.md](AGENTS.md)).
