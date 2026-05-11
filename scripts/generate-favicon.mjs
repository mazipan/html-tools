// Rasterizes a 32×32 PNG favicon per tool from the emoji icon listed in
// tools.json. Twemoji SVGs are read from node_modules/@twemoji/svg (no network
// required) and rendered with Resvg. The PNGs are written to src/ and
// committed; Parcel picks them up at build time via the per-page
// `<link rel="icon" href="favicon-<slug>.png">`.
//
// Re-run via `npm run generate:favicon` whenever a tool's icon changes or a
// new tool is added to tools.json. Also produces src/favicon.png — the
// site-wide fallback (🛠️) referenced from src/_partials/meta-base.html.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const FAVICON_SIZE = 32;
const FALLBACK_EMOJI = '🛠️';

// Twemoji's filename rule: join codepoints with '-' and drop the U+FE0F
// variation selector unless the sequence contains a zero-width joiner
// (U+200D). None of our icons use ZWJ, so we always strip FE0F.
function toTwemojiBase(emoji) {
  const hasZwj = [...emoji].some(c => c.codePointAt(0) === 0x200d);
  const cps = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (!hasZwj && cp === 0xfe0f) continue;
    cps.push(cp.toString(16));
  }
  return cps.join('-');
}

function loadTwemojiSvg(emoji) {
  const base = toTwemojiBase(emoji);
  const svgPath = resolve(root, 'node_modules/@twemoji/svg', `${base}.svg`);
  if (!existsSync(svgPath)) {
    throw new Error(
      `No Twemoji SVG for "${emoji}" (codepoints "${base}") at ${svgPath}`,
    );
  }
  return readFileSync(svgPath, 'utf8');
}

function renderFavicon(svg) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: FAVICON_SIZE },
  })
    .render()
    .asPng();
}

const tools = JSON.parse(readFileSync(resolve(root, 'src/tools.json'), 'utf8'));

// One favicon per tool, plus a site-wide fallback. The fallback is shipped at
// src/favicon.png so meta-base.html can reference it without per-page wiring.
const targets = [
  { outFile: 'favicon.png', emoji: FALLBACK_EMOJI, label: 'fallback' },
  ...tools.tools.map(t => ({
    outFile: `favicon-${t.slug}.png`,
    emoji: t.icon,
    label: t.slug,
  })),
];

let written = 0;
for (const { outFile, emoji, label } of targets) {
  const svg = loadTwemojiSvg(emoji);
  const png = renderFavicon(svg);
  const outPath = resolve(root, 'src', outFile);
  writeFileSync(outPath, png);
  console.log(
    `[generate-favicon] ${label.padEnd(20)} ${emoji}  → src/${outFile} (${png.length} B)`,
  );
  written++;
}
console.log(`[generate-favicon] 🎉 wrote ${written} favicons`);
