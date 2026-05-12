// ──────────────────────────────────────────────────────────────
//  Code Snippet to Image — canvas-driven snippet → PNG card
//  Tokenization: Shiki + @shikijs/engine-javascript (no WASM).
//  Render: a single drawAll(ctx) used for the dpr-scaled preview
//  and for the 1× export canvas, so PNG = preview pixel-for-pixel.
//  All processing runs locally; nothing leaves the browser.
//
//  Lives as a sibling module (not an inline <script type="module">)
//  because Parcel only follows the import graph and emits hashed
//  code-split chunks for *external* module entries — inline modules
//  ship with bare specifiers unresolved.
// ──────────────────────────────────────────────────────────────

// Importing from `@shikijs/core` (not `shiki/core`) sidesteps shiki's
// conditional-export map — Parcel 2's resolver doesn't pick up the
// "default" branch under the `unwasm` condition, so the shorter path
// resolves cleanly.
import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
// Eager imports for the default lang + theme so first paint doesn't
// wait on a network round trip. Every other lang/theme is dynamic.
import langTypescript from '@shikijs/langs/typescript';
import themeGithubDark from '@shikijs/themes/github-dark';

// ── Curated lang + theme registry ────────────────────────────
// Switch statements (not template-string imports) so Parcel can
// statically resolve every code-split chunk at build time.
const LANGS = [
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['tsx', 'TSX'],
  ['jsx', 'JSX'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['markdown', 'Markdown'],
  ['python', 'Python'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['ruby', 'Ruby'],
  ['java', 'Java'],
  ['shellscript', 'Shell'],
  ['sql', 'SQL'],
];
const THEMES = [
  ['github-dark', 'GitHub Dark'],
  ['github-light', 'GitHub Light'],
  ['dracula', 'Dracula'],
  ['nord', 'Nord'],
  ['monokai', 'Monokai'],
  ['one-dark-pro', 'One Dark Pro'],
  ['vitesse-dark', 'Vitesse Dark'],
  ['vitesse-light', 'Vitesse Light'],
];

async function fetchLang(name) {
  switch (name) {
    case 'typescript':  return (await import('@shikijs/langs/typescript')).default;
    case 'javascript':  return (await import('@shikijs/langs/javascript')).default;
    case 'tsx':         return (await import('@shikijs/langs/tsx')).default;
    case 'jsx':         return (await import('@shikijs/langs/jsx')).default;
    case 'html':        return (await import('@shikijs/langs/html')).default;
    case 'css':         return (await import('@shikijs/langs/css')).default;
    case 'json':        return (await import('@shikijs/langs/json')).default;
    case 'yaml':        return (await import('@shikijs/langs/yaml')).default;
    case 'markdown':    return (await import('@shikijs/langs/markdown')).default;
    case 'python':      return (await import('@shikijs/langs/python')).default;
    case 'go':          return (await import('@shikijs/langs/go')).default;
    case 'rust':        return (await import('@shikijs/langs/rust')).default;
    case 'ruby':        return (await import('@shikijs/langs/ruby')).default;
    case 'java':        return (await import('@shikijs/langs/java')).default;
    case 'shellscript': return (await import('@shikijs/langs/shellscript')).default;
    case 'sql':         return (await import('@shikijs/langs/sql')).default;
    default:            return null;
  }
}
async function fetchTheme(name) {
  switch (name) {
    case 'github-dark':   return (await import('@shikijs/themes/github-dark')).default;
    case 'github-light':  return (await import('@shikijs/themes/github-light')).default;
    case 'dracula':       return (await import('@shikijs/themes/dracula')).default;
    case 'nord':          return (await import('@shikijs/themes/nord')).default;
    case 'monokai':       return (await import('@shikijs/themes/monokai')).default;
    case 'one-dark-pro':  return (await import('@shikijs/themes/one-dark-pro')).default;
    case 'vitesse-dark':  return (await import('@shikijs/themes/vitesse-dark')).default;
    case 'vitesse-light': return (await import('@shikijs/themes/vitesse-light')).default;
    default:              return null;
  }
}

// ── Curated gradient palette (subset of gradients.html) ──────
// angle 90 = horizontal left→right; 0 = top→bottom (canvas convention).
const GRADIENTS = [
  { name: 'Midnight',  angle: 90, stops: ['#1e3a8a', '#0f172a'] },
  { name: 'Charcoal',  angle: 90, stops: ['#374151', '#030712'] },
  { name: 'Plum',      angle: 90, stops: ['#7e22ce', '#1e1b4b'] },
  { name: 'Forest',    angle: 90, stops: ['#065f46', '#042f2e'] },
  { name: 'Wine',      angle: 90, stops: ['#831843', '#18181b'] },
  { name: 'Ocean',     angle: 90, stops: ['#06b6d4', '#1e40af'] },
  { name: 'Twilight',  angle: 90, stops: ['#1e40af', '#7c3aed'] },
  { name: 'Aurora',    angle: 90, stops: ['#10b981', '#3b82f6'] },
  { name: 'Cosmic',    angle: 90, stops: ['#7c3aed', '#ec4899'] },
  { name: 'Copper',    angle: 90, stops: ['#7c2d12', '#f59e0b'] },
  { name: 'Sunset',    angle: 90, stops: ['#f97316', '#db2777'] },
  { name: 'Volcano',   angle: 90, stops: ['#7f1d1d', '#f59e0b'] },
  { name: 'Hyper',     angle: 90, stops: ['#ec4899', '#ef4444', '#facc15'] },
  { name: 'Cherry',    angle: 90, stops: ['#f43f5e', '#b91c1c'] },
  { name: 'Tangerine', angle: 90, stops: ['#f97316', '#fde047'] },
  { name: 'Lime',      angle: 90, stops: ['#84cc16', '#059669'] },
  { name: 'Pacific',   angle: 90, stops: ['#0ea5e9', '#22d3ee'] },
  { name: 'Sky',       angle: 90, stops: ['#bae6fd', '#38bdf8'] },
  { name: 'Sakura',    angle: 90, stops: ['#fb7185', '#f9a8d4'] },
  { name: 'Cream',     angle: 90, stops: ['#fed7aa', '#fef3c7'] },
];

// ── State ────────────────────────────────────────────────────
const SAMPLE = `// Fetch JSON and render results.
// Press "Load sample" to swap in another language.
type User = { id: number; name: string; email: string };

async function fetchUsers(): Promise<User[]> {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

fetchUsers()
  .then(users => users.filter(u => u.email.endsWith('@example.com')))
  .then(console.log);
`;

const state = {
  code: SAMPLE,
  lang: 'typescript',
  theme: 'github-dark',
  chrome: 'dots',          // 'none' | 'dots' | 'title'
  filename: 'example.ts',
  radius: 12,
  shadow: true,
  shadowIntensity: 55,
  bgMode: 'gradient',      // 'gradient' | 'solid' | 'transparent'
  bgGradient: 0,
  bgSolid: '#0b1220',
  padOuter: 56,
  padInner: 20,
  fontSize: 15,
  lineHeight: 1.5,
  fontFamily: 'ibm-plex-mono',  // key into FONT_STACK
  lineNumbers: true,
  widthPreset: 'auto',     // 'auto' | '1600' | '1080'
};

const FONT_STACK = {
  'ibm-plex-mono':   `'IBM Plex Mono', ui-monospace, monospace`,
  'jetbrains-mono':  `'JetBrains Mono', ui-monospace, monospace`,
  'fira-code':       `'Fira Code', ui-monospace, monospace`,
};
// Google Fonts URL for non-default fonts; loaded lazily on selection.
const FONT_HREF = {
  'jetbrains-mono':
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap',
  'fira-code':
    'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap',
};
const loadedFontLinks = new Set();
async function ensureFont(key) {
  const stack = FONT_STACK[key];
  if (!stack) return;
  const family = stack.match(/'([^']+)'/)?.[1] ?? 'monospace';
  const href = FONT_HREF[key];
  // Wait for the stylesheet to actually parse — without this,
  // document.fonts.load resolves immediately against an unknown family
  // and canvas keeps rendering the monospace fallback.
  if (href && !loadedFontLinks.has(href)) {
    loadedFontLinks.add(href);
    await new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }
  try {
    await Promise.all([
      document.fonts.load(`${state.fontSize}px '${family}'`),
      document.fonts.load(`bold ${state.fontSize}px '${family}'`),
      document.fonts.load(`italic ${state.fontSize}px '${family}'`),
    ]);
  } catch { /* fonts.load throws on garbage; let the canvas fall back */ }
}

// ── Highlighter ──────────────────────────────────────────────
let highlighter = null;
const loadedLangs = new Set(['typescript']);
const loadedThemes = new Set(['github-dark']);

async function initHighlighter() {
  highlighter = await createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [langTypescript],
    themes: [themeGithubDark],
  });
}

async function ensureLang(name) {
  if (loadedLangs.has(name)) return;
  const lang = await fetchLang(name);
  if (!lang) return;
  await highlighter.loadLanguage(lang);
  loadedLangs.add(name);
}
async function ensureTheme(name) {
  if (loadedThemes.has(name)) return;
  const theme = await fetchTheme(name);
  if (!theme) return;
  await highlighter.loadTheme(theme);
  loadedThemes.add(name);
}

// ── Canvas + render pipeline ─────────────────────────────────
const canvas = document.getElementById('snip-canvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvas-wrap');
const loadingOverlay = document.getElementById('loading-overlay');
const sizeReadout = document.getElementById('size-readout');

let tokenized = null;

function tokenize() {
  if (!highlighter) return null;
  try {
    const out = highlighter.codeToTokens(state.code, {
      lang: state.lang,
      theme: state.theme,
    });
    return out;
  } catch (err) {
    console.warn('[snippet-to-image] tokenize failed', err);
    return null;
  }
}

function composeFont(size, familyKey, fontStyleFlag) {
  const stack = FONT_STACK[familyKey] || FONT_STACK['ibm-plex-mono'];
  // Shiki's fontStyle bitmask: 1=italic, 2=bold, 4=underline (we ignore underline).
  const italic = (fontStyleFlag & 1) ? 'italic ' : '';
  const bold   = (fontStyleFlag & 2) ? 'bold '   : '';
  return `${italic}${bold}${size}px ${stack}`;
}

function colorOr(value, fallback) {
  return (value && typeof value === 'string') ? value : fallback;
}

function drawAll(c, opts = {}) {
  const tk = opts.tokens ?? tokenized;
  if (!tk) return { wCss: 0, hCss: 0 };

  const themeBg = colorOr(tk.bg, '#0b1220');
  const themeFg = colorOr(tk.fg, '#e5e7eb');
  const lines = tk.tokens;

  const fontSize = state.fontSize;
  const lineH = Math.round(fontSize * state.lineHeight);
  const fontKey = state.fontFamily;
  c.font = composeFont(fontSize, fontKey, 0);
  const charW = c.measureText('M').width;
  const longestChars = lines.reduce((max, line) => {
    const len = line.reduce((s, t) => s + t.content.length, 0);
    return Math.max(max, len);
  }, 0);

  const gutterDigits = String(lines.length).length;
  const gutterW = state.lineNumbers ? (gutterDigits * charW + 16) : 0;
  const innerPad = state.padInner;
  const outerPad = state.padOuter;

  let chromeH = 0;
  if (state.chrome === 'dots') chromeH = 32;
  else if (state.chrome === 'title') chromeH = 36;

  const codeW = Math.ceil(longestChars * charW);
  const codeH = lines.length * lineH;

  const winInnerW = innerPad + gutterW + codeW + innerPad;
  const winInnerH = chromeH + innerPad + codeH + innerPad;

  let wCss, hCss, winW, winH;
  if (state.widthPreset === 'auto' || state.bgMode === 'transparent') {
    winW = winInnerW;
    winH = winInnerH;
    wCss = winW + outerPad * 2;
    hCss = winH + outerPad * 2;
  } else {
    wCss = Number(state.widthPreset);
    winW = Math.min(winInnerW, wCss - outerPad * 2);
    if (winInnerW > wCss - outerPad * 2) {
      winW = winInnerW;
      wCss = winW + outerPad * 2;
    }
    winH = winInnerH;
    hCss = winH + outerPad * 2;
  }

  // ── Paint outer background ─────────────────────────────────
  if (state.bgMode === 'gradient') {
    const g = GRADIENTS[state.bgGradient];
    const rad = (g.angle - 90) * Math.PI / 180;
    const cx = wCss / 2, cy = hCss / 2;
    const dx = Math.cos(rad) * wCss / 2;
    const dy = Math.sin(rad) * hCss / 2;
    const grad = c.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    const n = g.stops.length;
    g.stops.forEach((col, i) => grad.addColorStop(i / (n - 1), col));
    c.fillStyle = grad;
    c.fillRect(0, 0, wCss, hCss);
  } else if (state.bgMode === 'solid') {
    c.fillStyle = state.bgSolid;
    c.fillRect(0, 0, wCss, hCss);
  } else {
    c.clearRect(0, 0, wCss, hCss);
  }

  // ── Window box ─────────────────────────────────────────────
  const winX = (wCss - winW) / 2;
  const winY = (hCss - winH) / 2;
  const radius = Number(state.radius);

  c.save();
  if (state.shadow) {
    const k = state.shadowIntensity / 100;
    c.shadowColor = `rgba(0, 0, 0, ${0.15 + k * 0.45})`;
    c.shadowBlur = 10 + k * 50;
    c.shadowOffsetY = 6 + k * 16;
  }
  c.fillStyle = themeBg;
  roundRect(c, winX, winY, winW, winH, radius);
  c.fill();
  c.restore();

  // ── Chrome ─────────────────────────────────────────────────
  if (state.chrome === 'dots') {
    const cy0 = winY + 16;
    const cx0 = winX + 20;
    const r = 6;
    const colors = ['#ff5f57', '#febc2e', '#28c840'];
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(cx0 + i * 20, cy0, r, 0, Math.PI * 2);
      c.fillStyle = colors[i];
      c.fill();
    }
  } else if (state.chrome === 'title') {
    c.save();
    c.beginPath();
    c.moveTo(winX, winY + chromeH);
    c.lineTo(winX + winW, winY + chromeH);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.stroke();
    c.font = composeFont(Math.max(11, fontSize - 3), fontKey, 0);
    c.fillStyle = colorOr(tk.fg, '#9ca3af');
    c.globalAlpha = 0.55;
    c.textBaseline = 'middle';
    c.fillText(state.filename || '', winX + 16, winY + chromeH / 2);
    c.globalAlpha = 1;
    c.restore();
  }

  // ── Code body ──────────────────────────────────────────────
  c.textBaseline = 'alphabetic';
  const codeOriginX = winX + innerPad + gutterW;
  const codeOriginY = winY + chromeH + innerPad;
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = lines[i];
    const baselineY = codeOriginY + (i + 1) * lineH - Math.round(lineH * 0.25);

    if (state.lineNumbers) {
      c.font = composeFont(fontSize, fontKey, 0);
      c.fillStyle = themeFg;
      c.globalAlpha = 0.35;
      const num = String(i + 1);
      const gutterTextW = c.measureText(num).width;
      c.fillText(
        num,
        winX + innerPad + gutterW - gutterTextW - 8,
        baselineY,
      );
      c.globalAlpha = 1;
    }

    let x = codeOriginX;
    for (const tok of lineTokens) {
      c.font = composeFont(fontSize, fontKey, tok.fontStyle ?? 0);
      c.fillStyle = colorOr(tok.color, themeFg);
      c.fillText(tok.content, x, baselineY);
      x += tok.content.length * charW;
    }
  }

  return { wCss, hCss };
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

// Two-pass render: measure → resize the real canvas (dpr-scaled) → draw.
function renderPreview() {
  if (!tokenized) return;
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const { wCss, hCss } = drawAll(measureCtx, { tokens: tokenized });
  if (!wCss || !hCss) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(wCss * dpr);
  canvas.height = Math.round(hCss * dpr);
  // `aspect-ratio` (paired with `max-width: 100%; height: auto` in CSS) lets the
  // canvas shrink proportionally on narrow viewports — without it a px-valued
  // style.height stays fixed while max-width clamps the width, stretching the
  // image vertically.
  canvas.style.width = wCss + 'px';
  canvas.style.height = '';
  canvas.style.aspectRatio = `${wCss} / ${hCss}`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  drawAll(ctx, { tokens: tokenized });

  canvasWrap.classList.toggle('transparent', state.bgMode === 'transparent');
  sizeReadout.textContent = `${wCss} × ${hCss} px`;
}

// Render to a fresh 1× canvas for export. Returns { canvas, w, h }.
function renderForExport() {
  if (!tokenized) return null;
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const { wCss, hCss } = drawAll(measureCtx, { tokens: tokenized });
  if (!wCss || !hCss) return null;
  const out = document.createElement('canvas');
  out.width = wCss;
  out.height = hCss;
  const outCtx = out.getContext('2d');
  drawAll(outCtx, { tokens: tokenized });
  return { canvas: out, w: wCss, h: hCss };
}

// ── Repaint scheduling ───────────────────────────────────────
let rafId = null;
function scheduleRepaint() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    renderPreview();
  });
}

let tokenizeTimer = null;
function scheduleRetokenize() {
  if (tokenizeTimer) clearTimeout(tokenizeTimer);
  tokenizeTimer = setTimeout(() => {
    tokenizeTimer = null;
    tokenized = tokenize();
    scheduleRepaint();
  }, 100);
}

async function changeLangOrTheme() {
  showLoading('Loading…');
  await Promise.all([ensureLang(state.lang), ensureTheme(state.theme)]);
  tokenized = tokenize();
  hideLoading();
  scheduleRepaint();
}

function showLoading(msg) {
  loadingOverlay.querySelector('span:last-child').textContent = msg;
  loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// ── DOM wiring ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const codeInput   = $('code-input');
const langSelect  = $('lang-select');
const themeSelect = $('theme-select');
const chromeSelect= $('chrome-select');
const filenameRow = $('filename-row');
const filenameInput = $('filename-input');
const radiusSelect = $('radius-select');
const shadowToggle = $('shadow-toggle');
const shadowRange  = $('shadow-range');
const shadowVal    = $('shadow-val');
const padOuter     = $('pad-outer');
const padOuterVal  = $('pad-outer-val');
const padInner     = $('pad-inner');
const padInnerVal  = $('pad-inner-val');
const fontSize     = $('font-size');
const fontSizeVal  = $('font-size-val');
const lineHeight   = $('line-height');
const fontFamily   = $('font-family');
const lineNumbers  = $('line-numbers');
const widthPreset  = $('width-preset');
const bgSolidColor = $('bg-solid-color');
const bgSolidText  = $('bg-solid-text');
const gradGrid     = $('grad-grid');
const tabGrad      = $('tab-bg-grad');
const tabSolid     = $('tab-bg-solid');
const tabNone      = $('tab-bg-none');
const exportStatus = $('export-status');

for (const [val, label] of LANGS) {
  const opt = document.createElement('option');
  opt.value = val; opt.textContent = label;
  langSelect.appendChild(opt);
}
for (const [val, label] of THEMES) {
  const opt = document.createElement('option');
  opt.value = val; opt.textContent = label;
  themeSelect.appendChild(opt);
}
langSelect.value = state.lang;
themeSelect.value = state.theme;

GRADIENTS.forEach((g, i) => {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'grad-tile' + (i === state.bgGradient ? ' on' : '');
  tile.title = g.name;
  const css = `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`;
  tile.style.background = css;
  tile.addEventListener('click', () => {
    state.bgGradient = i;
    gradGrid.querySelectorAll('.grad-tile').forEach(el => el.classList.remove('on'));
    tile.classList.add('on');
    scheduleRepaint();
  });
  gradGrid.appendChild(tile);
});

codeInput.value = state.code;

function syncFilenameRow() {
  filenameRow.classList.toggle('hidden', state.chrome !== 'title');
}
syncFilenameRow();
filenameInput.value = state.filename;

codeInput.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.slice(0, start) + '  ' + codeInput.value.slice(end);
    codeInput.selectionStart = codeInput.selectionEnd = start + 2;
    codeInput.dispatchEvent(new Event('input'));
  }
});
codeInput.addEventListener('input', () => {
  state.code = codeInput.value;
  scheduleRetokenize();
});

const EXT_BY_LANG = {
  typescript: 'ts', javascript: 'js', tsx: 'tsx', jsx: 'jsx',
  html: 'html', css: 'css', json: 'json', yaml: 'yaml',
  markdown: 'md', python: 'py', go: 'go', rust: 'rs',
  ruby: 'rb', java: 'java', shellscript: 'sh', sql: 'sql',
};
const EXT_PATTERN = /^example\.(ts|js|tsx|jsx|html|css|json|yaml|md|py|go|rs|rb|java|sh|sql)$/;

langSelect.addEventListener('change', () => {
  state.lang = langSelect.value;
  if (EXT_PATTERN.test(state.filename)) {
    state.filename = `example.${EXT_BY_LANG[state.lang] || 'txt'}`;
    filenameInput.value = state.filename;
  }
  changeLangOrTheme();
});
themeSelect.addEventListener('change', () => {
  state.theme = themeSelect.value;
  changeLangOrTheme();
});

chromeSelect.addEventListener('change', () => {
  state.chrome = chromeSelect.value;
  syncFilenameRow();
  scheduleRepaint();
});
filenameInput.addEventListener('input', () => {
  state.filename = filenameInput.value;
  scheduleRepaint();
});

radiusSelect.addEventListener('change', () => {
  state.radius = Number(radiusSelect.value);
  scheduleRepaint();
});
shadowToggle.addEventListener('change', () => {
  state.shadow = shadowToggle.checked;
  scheduleRepaint();
});
shadowRange.addEventListener('input', () => {
  state.shadowIntensity = Number(shadowRange.value);
  shadowVal.textContent = state.shadowIntensity;
  scheduleRepaint();
});

padOuter.addEventListener('input', () => {
  state.padOuter = Number(padOuter.value);
  padOuterVal.textContent = state.padOuter;
  scheduleRepaint();
});
padInner.addEventListener('input', () => {
  state.padInner = Number(padInner.value);
  padInnerVal.textContent = state.padInner;
  scheduleRepaint();
});
fontSize.addEventListener('input', () => {
  state.fontSize = Number(fontSize.value);
  fontSizeVal.textContent = state.fontSize;
  scheduleRepaint();
});
lineHeight.addEventListener('change', () => {
  state.lineHeight = Number(lineHeight.value);
  scheduleRepaint();
});
fontFamily.addEventListener('change', async () => {
  state.fontFamily = fontFamily.value;
  await ensureFont(state.fontFamily);
  scheduleRepaint();
});
lineNumbers.addEventListener('change', () => {
  state.lineNumbers = lineNumbers.checked;
  scheduleRepaint();
});
widthPreset.addEventListener('change', () => {
  state.widthPreset = widthPreset.value;
  scheduleRepaint();
});

function setBgMode(mode) {
  state.bgMode = mode;
  $('bg-grad-panel').classList.toggle('hidden', mode !== 'gradient');
  $('bg-solid-panel').classList.toggle('hidden', mode !== 'solid');
  for (const t of [tabGrad, tabSolid, tabNone]) {
    t.classList.toggle('tab-btn-active', t.dataset.bg === mode);
  }
  scheduleRepaint();
}
tabGrad.addEventListener('click', () => setBgMode('gradient'));
tabSolid.addEventListener('click', () => setBgMode('solid'));
tabNone.addEventListener('click', () => setBgMode('transparent'));

bgSolidColor.addEventListener('input', () => {
  state.bgSolid = bgSolidColor.value;
  bgSolidText.value = state.bgSolid;
  scheduleRepaint();
});
bgSolidText.addEventListener('change', () => {
  const v = bgSolidText.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
    state.bgSolid = v;
    bgSolidColor.value = v.length === 4
      ? '#' + v.slice(1).split('').map(ch => ch + ch).join('')
      : v;
    scheduleRepaint();
  } else {
    bgSolidText.value = state.bgSolid;
  }
});

const SAMPLES = [
  ['typescript', SAMPLE],
  ['python', `# Greet by name and squareroot.
import math

def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("world"))
print(math.sqrt(2))
`],
  ['rust', `// Sum a vector with iterators.
fn main() {
    let xs: Vec<i32> = (1..=10).collect();
    let total: i32 = xs.iter().sum();
    println!("sum = {}", total);
}
`],
  ['css', `.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: linear-gradient(180deg, #6366f1, #4338ca);
  color: white;
}
`],
  ['json', `{
  "name": "html-tools",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "parcel 'src/*.html'",
    "build": "parcel build 'src/*.html'"
  }
}
`],
];
let sampleIdx = 0;
$('btn-sample').addEventListener('click', async () => {
  sampleIdx = (sampleIdx + 1) % SAMPLES.length;
  const [lang, src] = SAMPLES[sampleIdx];
  state.code = src;
  state.lang = lang;
  codeInput.value = src;
  langSelect.value = lang;
  state.filename = `example.${EXT_BY_LANG[lang] || 'txt'}`;
  filenameInput.value = state.filename;
  await changeLangOrTheme();
});

$('btn-reset').addEventListener('click', () => {
  state.code = SAMPLE;
  state.lang = 'typescript';
  state.theme = 'github-dark';
  codeInput.value = SAMPLE;
  langSelect.value = 'typescript';
  themeSelect.value = 'github-dark';
  state.filename = 'example.ts';
  filenameInput.value = state.filename;
  changeLangOrTheme();
});

// ── Export ───────────────────────────────────────────────────
function flashStatus(msg, ms = 2000) {
  exportStatus.textContent = msg;
  if (flashStatus._t) clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => { exportStatus.textContent = ''; }, ms);
}

function downloadPNG() {
  const result = renderForExport();
  if (!result) return;
  result.canvas.toBlob(blob => {
    if (!blob) { flashStatus('Export failed', 3000); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashStatus('Downloaded ✓');
  }, 'image/png');
}
function copyPNG() {
  const result = renderForExport();
  if (!result) return;
  if (!window.ClipboardItem || !navigator.clipboard?.write) {
    flashStatus('Clipboard not supported — downloading instead', 2500);
    return downloadPNG();
  }
  result.canvas.toBlob(async blob => {
    if (!blob) { flashStatus('Copy failed', 3000); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashStatus('Copied ✓');
    } catch (err) {
      console.warn('[snippet-to-image] clipboard write failed', err);
      flashStatus('Clipboard blocked — downloading instead', 2500);
      downloadPNG();
    }
  }, 'image/png');
}
$('btn-download').addEventListener('click', downloadPNG);
$('btn-copy').addEventListener('click', copyPNG);

// ── Boot ─────────────────────────────────────────────────────
(async () => {
  try {
    await initHighlighter();
    await ensureFont(state.fontFamily);
    tokenized = tokenize();
    hideLoading();
    scheduleRepaint();
  } catch (err) {
    console.error('[snippet-to-image] init failed', err);
    loadingOverlay.querySelector('span:last-child').textContent =
      'Failed to load highlighter — see console.';
  }
})();
