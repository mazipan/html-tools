// Deep-import the pre-built UMD bundle. The package's `browser` field in
// package.json points to a `dist/jsmediatags.js` file that isn't shipped with
// the npm package — only the minified version is. Importing the min file
// directly bypasses the broken field while still using a clean ESM specifier.

import { ID3Writer } from 'browser-id3-writer';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

const { formatBytes, buildStoreZip } = window;

// ── State ───────────────────────────────────────────────────────────────────
// Per-file:
// {
//   id, file, name,
//   parsed: { title, artist, album, year, genre, trackN, trackTotal, comment, art },  // immutable, never overwritten
//   pending: { ...same shape... },  // mutable working copy; saved on Save
//   smartFill: { suggestions: { artist?, title?, track? }, confidence: 'normal'|'low' } | null,
//   suggestionState: 'pending' | 'applied' | 'dismissed',
//   sizeBytes,
//   tagFormat: 'v2.3' | 'v2.4' | 'v1 only' | 'none' | ...,
//   encoding: 'utf-8'|'latin-1'|'unknown',
//   warnings: string[],
//   edited: boolean,
// }
const items = [];
let selectedId = null;
let nextId = 1;
const MAX_FILES = 100;
const WARN_MB = 50;
const REJECT_MB = 200;

// Last applied suggestion for undo (per-file, transient — replaced on next apply)
let lastUndo = null; // { id, prev: <copy of pending> }

// ── DOM refs ────────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const dropEmpty = document.getElementById('drop-empty');
const dropCompact = document.getElementById('drop-compact');
const fileInput = document.getElementById('file-input');
const errorBar = document.getElementById('error-bar');
const warnBar = document.getElementById('warn-bar');
const appPanel = document.getElementById('app-panel');
const toolbar = document.getElementById('toolbar');
const smartFillAllBtn = document.getElementById('smart-fill-all-btn');
const smartFillAllCount = document.getElementById('smart-fill-all-count');
const includeLowConf = document.getElementById('include-low-conf');
const filenamePattern = document.getElementById('filename-pattern');
const filesList = document.getElementById('files-list');
const fileCountEl = document.getElementById('file-count');
const clearBtn = document.getElementById('clear-btn');
const editorEmpty = document.getElementById('editor-empty');
const editorForm = document.getElementById('editor-form');
const sugRow = document.getElementById('sug-row');
const sugItems = document.getElementById('sug-items');
const sugConfTag = document.getElementById('sug-conf-tag');
const sugApplyAll = document.getElementById('sug-apply-all');
const sugDismiss = document.getElementById('sug-dismiss');
const sugApplied = document.getElementById('sug-applied');
const sugUndo = document.getElementById('sug-undo');
const fTitle = document.getElementById('f-title');
const fArtist = document.getElementById('f-artist');
const fAlbum = document.getElementById('f-album');
const fYear = document.getElementById('f-year');
const fGenre = document.getElementById('f-genre');
const fTrack = document.getElementById('f-track');
const fTrackTotal = document.getElementById('f-track-total');
const fComment = document.getElementById('f-comment');
const artImg = document.getElementById('art-img');
const artEmpty = document.getElementById('art-empty');
const artInfo = document.getElementById('art-info');
const artReplace = document.getElementById('art-replace');
const artRemove = document.getElementById('art-remove');
const artInput = document.getElementById('art-input');
const saveBtn = document.getElementById('save-btn');
const saveAllBtn = document.getElementById('save-all-btn');
const statusEl = document.getElementById('status');

// ── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  clearTimeout(showError._t);
  showError._t = setTimeout(() => errorBar.classList.add('hidden'), 6000);
}
function hideError() {
  errorBar.classList.add('hidden');
}

function showWarn(msg) {
  warnBar.textContent = msg;
  warnBar.classList.remove('hidden');
  clearTimeout(showWarn._t);
  showWarn._t = setTimeout(() => warnBar.classList.add('hidden'), 8000);
}

// ── jsmediatags Promise wrapper ─────────────────────────────────────────────
function readTagsAsync(file) {
  return new Promise((resolve) => {
    new jsmediatags.Reader(file).read({
      onSuccess: resolve,
      // Resolve (not reject) on error too — we treat "no tags" as a valid state
      // and surface the lack of tags in the parsed result.
      onError: (err) => resolve({ __error: err }),
    });
  });
}

// ── Filename smart-fill ─────────────────────────────────────────────────────
const NOISE_PATTERNS = [
  /\(official\s+(music\s+)?video\)/i,
  /\(official\s+audio\)/i,
  /\(official\)/i,
  /\(lyrics?\)/i,
  /\[lyrics?\]/i,
  /\(hq\)/i,
  /\(hd\)/i,
  /\(audio\)/i,
  /\(visualizer\)/i,
  /\(music\s+video\)/i,
];

function stripNoise(s) {
  let out = s;
  for (const re of NOISE_PATTERNS) out = out.replace(re, '');
  return out.replace(/\s+/g, ' ').trim();
}

// Title-case only if the input is all lowercase / underscored. Preserves
// uppercase letters that already exist (so "DJ Shadow" and "iPhone" stay).
function smartCase(s) {
  if (!s) return s;
  const hasUpper = /[A-Z]/.test(s);
  if (hasUpper) return s.trim();
  return s
    .replace(/[_\s]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function pad2(n) {
  const s = String(n);
  return s.length < 2 ? `0${s}` : s;
}

// Parse a filename (stem only — no extension) into possible Artist/Title/Track.
// Returns { suggestions: { artist?, title?, track? }, confidence: 'normal' | 'low' } or null.
function inferFromFilename(filename) {
  const dot = filename.lastIndexOf('.');
  let stem = dot > 0 ? filename.slice(0, dot) : filename;
  stem = stem.trim();
  if (!stem) return null;

  // Strip leading track number forms: "01 ", "01.", "01_", "01-", "01 - ", "01. ", etc.
  // Capture the number for later use.
  const trackRe = /^(\d{1,3})[._\s-]+(.+)$/;
  const trackMatch = stem.match(trackRe);
  let leadingTrack = null;
  let body = stem;
  if (trackMatch) {
    leadingTrack = pad2(parseInt(trackMatch[1], 10));
    body = trackMatch[2].trim();
  }

  // Pattern 1 / 2: a leading track number was found
  if (leadingTrack !== null) {
    // 1: NN - Artist - Title  (body itself contains " - ")
    const dashIdx = body.indexOf(' - ');
    if (dashIdx >= 0) {
      const artist = smartCase(stripNoise(body.slice(0, dashIdx)));
      const title = smartCase(stripNoise(body.slice(dashIdx + 3)));
      if (artist && title) {
        return { suggestions: { artist, title, track: leadingTrack }, confidence: 'normal' };
      }
    }
    // 2: NN - Title
    const title = smartCase(stripNoise(body));
    if (title) {
      return { suggestions: { title, track: leadingTrack }, confidence: 'normal' };
    }
    return null;
  }

  // Pattern 3: Artist - NN - Title (e.g. "Daft Punk - 04 - Da Funk")
  const m3 = stem.match(/^(.+?)\s-\s(\d{1,3})\s-\s(.+)$/);
  if (m3) {
    return {
      suggestions: {
        artist: smartCase(stripNoise(m3[1])),
        title: smartCase(stripNoise(m3[3])),
        track: pad2(parseInt(m3[2], 10)),
      },
      confidence: 'normal',
    };
  }

  // Pattern 4: Artist - Title (first " - " split)
  const dashIdx = stem.indexOf(' - ');
  if (dashIdx >= 0) {
    const artist = smartCase(stripNoise(stem.slice(0, dashIdx)));
    const title = smartCase(stripNoise(stem.slice(dashIdx + 3)));
    if (artist && title) {
      return { suggestions: { artist, title }, confidence: 'normal' };
    }
  }

  // Pattern 5: underscore-only filename (no spaces, no dashes) — split on middle "_"
  if (!/\s|-/.test(stem) && stem.includes('_')) {
    const parts = stem.split('_').filter(Boolean);
    if (parts.length >= 2) {
      const mid = Math.ceil(parts.length / 2);
      const a = parts.slice(0, mid).join(' ');
      const t = parts.slice(mid).join(' ');
      return {
        suggestions: { artist: smartCase(a), title: smartCase(t) },
        confidence: 'low',
      };
    }
  }

  // Pattern 6: title only (no recognizable separator)
  const onlyTitle = smartCase(stripNoise(stem));
  if (onlyTitle) {
    return { suggestions: { title: onlyTitle }, confidence: 'normal' };
  }
  return null;
}

// Strip any keys that already have a value in `pending` (we never overwrite).
function filterSuggestions(suggestions, pending) {
  const out = {};
  for (const k of ['artist', 'title', 'track']) {
    if (!suggestions[k]) continue;
    const pendingKey = k === 'track' ? 'trackN' : k;
    if (pending[pendingKey] && String(pending[pendingKey]).trim() !== '') continue;
    out[k] = suggestions[k];
  }
  return out;
}

// ── Tag parse → normalized state ────────────────────────────────────────────
function normalizeParsed(rawTag) {
  const out = {
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    trackN: '',
    trackTotal: '',
    comment: '',
    art: null, // { mime, bytes: Uint8Array, dataUrl } | null
  };
  const tags = rawTag?.tags || {};

  out.title = String(tags.title ?? '').trim();
  out.artist = String(tags.artist ?? '').trim();
  out.album = String(tags.album ?? '').trim();
  out.year = String(tags.year ?? '').trim();
  // Genre may come as "(17)Rock" form (ID3v1 numeric reference) — strip the leading "(n)"
  const rawGenre = String(tags.genre ?? '').trim();
  out.genre = rawGenre.replace(/^\(\d+\)/, '').trim();

  // Track may be "5" or "5/12" — split.
  const rawTrack = String(tags.track ?? '').trim();
  if (rawTrack) {
    const tm = rawTrack.match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
    if (tm) {
      out.trackN = tm[1];
      out.trackTotal = tm[2] || '';
    } else {
      out.trackN = rawTrack;
    }
  }

  // Comment: jsmediatags returns a string for ID3v1 or { text, ... } for ID3v2
  if (tags.comment) {
    if (typeof tags.comment === 'string') out.comment = tags.comment.trim();
    else if (typeof tags.comment === 'object') out.comment = String(tags.comment.text ?? '').trim();
  }

  // APIC picture: { format, type, description, data: number[] }
  if (tags.picture?.data) {
    const mime = tags.picture.format || 'image/jpeg';
    const bytes = new Uint8Array(tags.picture.data);
    out.art = { mime, bytes, dataUrl: bytesToDataUrl(bytes, mime) };
  }

  return out;
}

function bytesToDataUrl(bytes, mime) {
  // Use chunked btoa to avoid stack overflow on large images
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime || 'image/jpeg'};base64,${btoa(bin)}`;
}

function describeTagFormat(rawTag) {
  if (!rawTag || rawTag.__error) return 'no tags';
  const t = rawTag.type;
  if (t === 'ID3v2') {
    const v = rawTag.version ? `v${rawTag.version.split('.').slice(0, 2).join('.')}` : 'v2';
    return `ID3 ${v}`;
  }
  if (t === 'ID3v1') return 'ID3v1 only';
  if (t === 'ID3') return 'ID3';
  return t || 'tagged';
}

// ── Add a file ──────────────────────────────────────────────────────────────
async function addFile(file) {
  if (items.length >= MAX_FILES) {
    showError(`Reached ${MAX_FILES}-file limit; remove some to add more.`);
    return false;
  }
  const sizeBytes = file.size;
  if (sizeBytes > REJECT_MB * 1024 * 1024) {
    showError(
      `${file.name} is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB — over the ${REJECT_MB} MB limit.`,
    );
    return false;
  }
  if (sizeBytes > WARN_MB * 1024 * 1024) {
    showWarn(
      `${file.name} is large (${(sizeBytes / 1024 / 1024).toFixed(0)} MB); processing may use significant memory.`,
    );
  }

  const id = String(nextId++);
  const item = {
    id,
    file,
    name: file.name,
    parsed: null,
    pending: null,
    smartFill: null,
    suggestionState: 'pending',
    sizeBytes,
    tagFormat: 'parsing…',
    encoding: 'unknown',
    warnings: [],
    edited: false,
  };
  items.push(item);
  renderCard(item);
  updateView();

  // Parse tags asynchronously
  const rawTag = await readTagsAsync(file);
  item.parsed = normalizeParsed(rawTag);
  item.pending = { ...item.parsed, art: item.parsed.art };
  item.tagFormat = describeTagFormat(rawTag);

  // Always compute smart-fill suggestions from the filename — the chip row
  // hides itself when there's nothing left to fill (filterSuggestions skips
  // any field that already has a value, so existing tags are still safe).
  const inferred = inferFromFilename(item.name);
  if (inferred) {
    const filtered = filterSuggestions(inferred.suggestions, item.pending);
    if (Object.keys(filtered).length > 0) {
      item.smartFill = { suggestions: filtered, confidence: inferred.confidence };
    }
  }

  renderCard(item);
  if (item.id === selectedId) bindEditor(item);
  updateToolbarState();
  return true;
}

// ── File-card rendering ─────────────────────────────────────────────────────
function renderCard(item) {
  let card = document.getElementById(`card-${item.id}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `card-${item.id}`;
    card.className = 'mp3-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => selectFile(item.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectFile(item.id);
      }
    });
    filesList.appendChild(card);
  }
  card.classList.toggle('is-selected', item.id === selectedId);

  const badges = [];
  if (item.tagFormat === 'parsing…') {
    badges.push(`<span class="badge badge-working">parsing…</span>`);
  } else if (item.tagFormat === 'no tags') {
    badges.push(`<span class="badge badge-warn">no tags</span>`);
  } else if (item.tagFormat === 'ID3v1 only') {
    badges.push(`<span class="badge badge-warn">ID3v1 only</span>`);
  } else {
    badges.push(`<span class="badge badge-done">${escHtml(item.tagFormat)}</span>`);
  }
  if (item.edited) badges.push(`<span class="badge badge-working">edited</span>`);
  if (item.smartFill && item.suggestionState === 'pending') {
    const count = Object.keys(item.smartFill.suggestions).length;
    const cls = item.smartFill.confidence === 'low' ? 'badge-warn' : 'badge-working';
    badges.push(`<span class="badge ${cls}">✨ ${count} sug</span>`);
  }
  if (item.warnings.length) {
    badges.push(
      `<span class="badge badge-warn" title="${escHtml(item.warnings.join('; '))}">!</span>`,
    );
  }

  card.innerHTML = `
    <div class="min-w-0">
      <div class="mp3-card-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
      <div class="mp3-card-meta">
        <span>${formatBytes(item.sizeBytes)}</span>
        ${badges.join('')}
      </div>
    </div>
    <div class="mp3-card-actions">
      <button class="btn-icon ghost btn-icon-sm" data-action="remove" data-id="${item.id}" aria-label="Remove" title="Remove">
        <svg class="icon" aria-hidden="true"><use href="#icon-x"/></svg>
      </button>
    </div>
  `;
}

// Card action delegation (remove button)
filesList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="remove"]');
  if (!btn) return;
  e.stopPropagation();
  removeFile(btn.dataset.id);
});

function removeFile(id) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return;
  items.splice(idx, 1);
  document.getElementById(`card-${id}`)?.remove();
  if (selectedId === id) {
    selectedId = null;
    if (items.length > 0) selectFile(items[0].id);
    else {
      editorForm.classList.add('hidden');
      editorEmpty.classList.remove('hidden');
    }
  }
  updateView();
  updateToolbarState();
}

function selectFile(id) {
  const item = items.find((it) => it.id === id);
  if (!item) return;
  selectedId = id;
  for (const it of items) {
    const card = document.getElementById(`card-${it.id}`);
    if (card) card.classList.toggle('is-selected', it.id === id);
  }
  bindEditor(item);
}

// ── Editor binding ──────────────────────────────────────────────────────────
let bindingActive = false; // suppress input listeners during programmatic fills

function bindEditor(item) {
  editorEmpty.classList.add('hidden');
  editorForm.classList.remove('hidden');

  if (!item.pending) {
    // Still parsing — show a placeholder by clearing fields
    bindingActive = true;
    fTitle.value = fArtist.value = fAlbum.value = fYear.value = fGenre.value = '';
    fTrack.value = fTrackTotal.value = fComment.value = '';
    setArt(null);
    bindingActive = false;
    sugRow.classList.add('hidden');
    sugApplied.classList.add('hidden');
    return;
  }

  bindingActive = true;
  fTitle.value = item.pending.title || '';
  fArtist.value = item.pending.artist || '';
  fAlbum.value = item.pending.album || '';
  fYear.value = item.pending.year || '';
  fGenre.value = item.pending.genre || '';
  fTrack.value = item.pending.trackN || '';
  fTrackTotal.value = item.pending.trackTotal || '';
  fComment.value = item.pending.comment || '';
  setArt(item.pending.art);
  bindingActive = false;

  // Render suggestion row
  renderSuggestionRow(item);
}

function renderSuggestionRow(item) {
  // Hide if no suggestion, or if it was applied / dismissed
  if (!item.smartFill || item.suggestionState !== 'pending') {
    sugRow.classList.add('hidden');
    // Show "applied" banner with undo if this item was the last applied
    if (item.suggestionState === 'applied' && lastUndo?.id === item.id) {
      sugApplied.classList.remove('hidden');
    } else {
      sugApplied.classList.add('hidden');
    }
    return;
  }

  // Re-filter against current pending (user may have typed)
  const filtered = filterSuggestions(item.smartFill.suggestions, item.pending);
  if (Object.keys(filtered).length === 0) {
    sugRow.classList.add('hidden');
    return;
  }
  sugRow.classList.remove('hidden');
  sugApplied.classList.add('hidden');
  sugRow.classList.toggle('is-low', item.smartFill.confidence === 'low');
  sugConfTag.classList.toggle('hidden', item.smartFill.confidence !== 'low');

  const labels = { artist: 'Artist', title: 'Title', track: 'Track' };
  sugItems.innerHTML = Object.entries(filtered)
    .map(
      ([k, v]) => `
    <div class="sug-item">
      <span class="sug-label">${labels[k]}</span>
      <span class="sug-value" title="${escHtml(v)}">${escHtml(v)}</span>
      <button class="btn btn-sm" data-sug-key="${k}" type="button">Apply</button>
    </div>
  `,
    )
    .join('');
}

// Suggestion apply / apply all / dismiss
sugItems.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sug-key]');
  if (!btn) return;
  const item = currentItem();
  if (!item?.smartFill) return;
  applySuggestion(item, [btn.dataset.sugKey]);
});

sugApplyAll.addEventListener('click', () => {
  const item = currentItem();
  if (!item?.smartFill) return;
  applySuggestion(item, Object.keys(item.smartFill.suggestions));
});

sugDismiss.addEventListener('click', () => {
  const item = currentItem();
  if (!item) return;
  item.suggestionState = 'dismissed';
  sugRow.classList.add('hidden');
  renderCard(item);
  updateToolbarState();
});

sugUndo.addEventListener('click', () => {
  if (!lastUndo) return;
  const item = items.find((it) => it.id === lastUndo.id);
  if (!item) return;
  item.pending = lastUndo.prev;
  item.suggestionState = 'pending';
  item.edited = computeEdited(item);
  lastUndo = null;
  if (selectedId === item.id) bindEditor(item);
  renderCard(item);
  updateToolbarState();
});

function applySuggestion(item, keys) {
  if (!item.smartFill) return;
  // Re-filter so we never overwrite a typed value
  const filtered = filterSuggestions(item.smartFill.suggestions, item.pending);
  const toApply = keys.filter((k) => filtered[k] !== undefined);
  if (toApply.length === 0) return;
  // Snapshot for undo (deep-ish copy — art reference is shared, OK)
  const prev = { ...item.pending };
  for (const k of toApply) {
    if (k === 'artist') item.pending.artist = filtered.artist;
    else if (k === 'title') item.pending.title = filtered.title;
    else if (k === 'track' && !item.pending.trackN) item.pending.trackN = filtered.track;
  }
  // If everything applied, collapse the chip row
  const remaining = filterSuggestions(item.smartFill.suggestions, item.pending);
  if (Object.keys(remaining).length === 0) {
    item.suggestionState = 'applied';
    lastUndo = { id: item.id, prev };
    // Auto-clear the undo affordance after 5s
    clearTimeout(applySuggestion._t);
    applySuggestion._t = setTimeout(() => {
      if (lastUndo?.id === item.id) {
        lastUndo = null;
        if (selectedId === item.id) sugApplied.classList.add('hidden');
      }
    }, 5000);
  }
  item.edited = computeEdited(item);
  if (selectedId === item.id) bindEditor(item);
  renderCard(item);
  updateToolbarState();
}

// ── Editor field listeners ──────────────────────────────────────────────────
function bindFieldListener(el, key) {
  el.addEventListener('input', () => {
    if (bindingActive) return;
    const item = currentItem();
    if (!item?.pending) return;
    item.pending[key] = el.value;
    item.edited = computeEdited(item);
    // Suggestion may have just been filled in — re-render
    if (item.smartFill && item.suggestionState === 'pending') renderSuggestionRow(item);
    renderCard(item);
    updateToolbarState();
  });
}
bindFieldListener(fTitle, 'title');
bindFieldListener(fArtist, 'artist');
bindFieldListener(fAlbum, 'album');
bindFieldListener(fYear, 'year');
bindFieldListener(fGenre, 'genre');
bindFieldListener(fTrack, 'trackN');
bindFieldListener(fTrackTotal, 'trackTotal');
bindFieldListener(fComment, 'comment');

function computeEdited(item) {
  if (!item.parsed || !item.pending) return false;
  const keys = ['title', 'artist', 'album', 'year', 'genre', 'trackN', 'trackTotal', 'comment'];
  for (const k of keys) {
    if ((item.parsed[k] || '') !== (item.pending[k] || '')) return true;
  }
  // Art comparison: identity (replaced via setArt with a new ref, or null'd via remove)
  if (item.parsed.art !== item.pending.art) return true;
  return false;
}

function currentItem() {
  return items.find((it) => it.id === selectedId);
}

// ── Album art ───────────────────────────────────────────────────────────────
function setArt(art) {
  if (!art) {
    artImg.src = '';
    artImg.classList.add('hidden');
    artEmpty.classList.remove('hidden');
    artInfo.textContent = '';
    artRemove.classList.add('hidden');
    return;
  }
  artImg.src = art.dataUrl || '';
  artImg.classList.remove('hidden');
  artEmpty.classList.add('hidden');
  const kb = (art.bytes.byteLength / 1024).toFixed(0);
  artInfo.textContent = `${art.mime} · ${kb} KB`;
  artRemove.classList.remove('hidden');
}

artReplace.addEventListener('click', () => artInput.click());
artInput.addEventListener('change', async () => {
  const f = artInput.files?.[0];
  artInput.value = '';
  if (!f) return;
  const item = currentItem();
  if (!item) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
    showError('Album art must be PNG, JPEG, or WebP.');
    return;
  }
  const bytes = new Uint8Array(await f.arrayBuffer());
  const mime =
    f.type === 'image/webp' ? 'image/webp' : f.type === 'image/png' ? 'image/png' : 'image/jpeg';
  item.pending.art = { mime, bytes, dataUrl: bytesToDataUrl(bytes, mime) };
  setArt(item.pending.art);
  item.edited = computeEdited(item);
  renderCard(item);
});

artRemove.addEventListener('click', () => {
  const item = currentItem();
  if (!item) return;
  item.pending.art = null;
  setArt(null);
  item.edited = computeEdited(item);
  renderCard(item);
});

// ── Apply-to-all ────────────────────────────────────────────────────────────
document.querySelectorAll('.apply-all-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const src = currentItem();
    if (!src) return;
    const field = btn.dataset.field;
    if (items.length < 2) {
      showError('Only one file loaded — Apply-to-all needs at least two.');
      return;
    }
    const fieldKey = field === 'art' ? 'art' : field;
    const value = field === 'art' ? src.pending.art : src.pending[fieldKey];
    let touched = 0;
    for (const it of items) {
      if (it.id === src.id) continue;
      if (field === 'art') {
        it.pending.art = value; // share reference (writers read bytes independently)
      } else {
        it.pending[fieldKey] = value || '';
      }
      it.edited = computeEdited(it);
      renderCard(it);
      touched++;
    }
    statusEl.textContent = `Applied ${field} to ${touched} other file${touched === 1 ? '' : 's'}.`;
    clearTimeout(applyAllStatus._t);
    applyAllStatus._t = setTimeout(() => (statusEl.textContent = ''), 3000);
  });
});
function applyAllStatus() {} // for the _t timer namespace above

// Hide batch-only affordances when only one file is loaded. "Apply to all" and
// "Save all (zip)" are no-ops with a single file — showing them adds noise.
// Also flips an `is-batch` class on the editor form so the field-row grid
// reclaims the 2rem column that would otherwise sit empty.
function refreshBatchAffordances() {
  const isBatch = items.length >= 2;
  editorForm.classList.toggle('is-batch', isBatch);
  for (const b of document.querySelectorAll('.apply-all-btn')) {
    b.classList.toggle('hidden', !isBatch);
  }
  saveAllBtn.classList.toggle('hidden', !isBatch);
}

// ── Smart fill all (toolbar) ────────────────────────────────────────────────
// `respectLowConfSwitch=true` (default) honors the "Include uncertain guesses"
// switch; false ignores it (used to detect whether any low-confidence items
// exist at all, so we know whether to show the switch).
function smartFillEligible(item, respectLowConfSwitch = true) {
  if (!item.smartFill || item.suggestionState !== 'pending') return false;
  if (respectLowConfSwitch && item.smartFill.confidence === 'low' && !includeLowConf.checked) {
    return false;
  }
  return Object.keys(filterSuggestions(item.smartFill.suggestions, item.pending)).length > 0;
}

function updateToolbarState() {
  const eligible = items.filter((it) => smartFillEligible(it));
  const eligibleIgnoringSwitch = items.filter((it) => smartFillEligible(it, false));
  const hasLowConf = eligibleIgnoringSwitch.some((it) => it.smartFill?.confidence === 'low');

  // Hide the button entirely when nothing would happen on click. Same for the
  // switch — only show it when toggling would actually change the eligible set.
  smartFillAllBtn.classList.toggle('hidden', eligible.length === 0);
  smartFillAllCount.textContent = eligible.length ? `(${eligible.length})` : '';
  const lowConfWrap = includeLowConf.closest('label');
  if (lowConfWrap) lowConfWrap.classList.toggle('hidden', !hasLowConf);

  refreshBatchAffordances();
  fileCountEl.textContent = items.length ? `(${items.length})` : '';
}

smartFillAllBtn.addEventListener('click', () => {
  const eligible = items.filter(smartFillEligible);
  let count = 0;
  for (const item of eligible) {
    const keys = Object.keys(filterSuggestions(item.smartFill.suggestions, item.pending));
    if (!keys.length) continue;
    applySuggestionSilent(item, keys);
    count++;
  }
  // Clear undo (it's per-file, but a bulk action defeats it — keep simple)
  lastUndo = null;
  if (selectedId) {
    const cur = currentItem();
    if (cur) bindEditor(cur);
  }
  statusEl.textContent = `Smart-filled ${count} file${count === 1 ? '' : 's'}.`;
  clearTimeout(updateToolbarState._t);
  updateToolbarState._t = setTimeout(() => (statusEl.textContent = ''), 3000);
  updateToolbarState();
});

function applySuggestionSilent(item, keys) {
  // Like applySuggestion but doesn't touch UI state for the active item / undo
  if (!item.smartFill) return;
  const filtered = filterSuggestions(item.smartFill.suggestions, item.pending);
  for (const k of keys) {
    if (filtered[k] === undefined) continue;
    if (k === 'artist') item.pending.artist = filtered.artist;
    else if (k === 'title') item.pending.title = filtered.title;
    else if (k === 'track' && !item.pending.trackN) item.pending.trackN = filtered.track;
  }
  const remaining = filterSuggestions(item.smartFill.suggestions, item.pending);
  if (Object.keys(remaining).length === 0) item.suggestionState = 'applied';
  item.edited = computeEdited(item);
  renderCard(item);
}

includeLowConf.addEventListener('change', updateToolbarState);

// ── Save (write tags) ───────────────────────────────────────────────────────
async function writeTagsForItem(item) {
  const buf = await item.file.arrayBuffer();
  const writer = new ID3Writer(buf);
  const p = item.pending;
  if (p.title) writer.setFrame('TIT2', p.title);
  if (p.artist) writer.setFrame('TPE1', [p.artist]);
  if (p.album) writer.setFrame('TALB', p.album);
  if (p.year) {
    const y = parseInt(p.year, 10);
    if (!Number.isNaN(y)) writer.setFrame('TYER', y);
  }
  if (p.genre) writer.setFrame('TCON', [p.genre]);
  if (p.trackN) {
    const tStr = p.trackTotal ? `${p.trackN}/${p.trackTotal}` : String(p.trackN);
    writer.setFrame('TRCK', tStr);
  }
  if (p.comment) {
    writer.setFrame('COMM', { language: 'eng', description: '', text: p.comment });
  }
  if (p.art?.bytes && p.art.bytes.byteLength > 0) {
    try {
      writer.setFrame('APIC', {
        type: 3, // Cover (front)
        data: p.art.bytes.buffer.slice(
          p.art.bytes.byteOffset,
          p.art.bytes.byteOffset + p.art.bytes.byteLength,
        ),
        description: '',
      });
    } catch (err) {
      item.warnings.push(`Album art could not be embedded: ${err.message || err}`);
    }
  }
  writer.addTag();
  return writer.getBlob(); // audio/mpeg blob
}

function outputFilename(item) {
  const pattern = filenamePattern.value;
  const stem = item.name.replace(/\.mp3$/i, '');
  if (pattern === 'overwrite') return item.name;
  if (pattern === 'tagged') return `${stem}-tagged.mp3`;
  if (pattern === 'artist-title') {
    const artist = (item.pending.artist || '').replace(/[\\/:*?"<>|]/g, '_').trim();
    const title = (item.pending.title || '').replace(/[\\/:*?"<>|]/g, '_').trim();
    if (artist && title) return `${artist} - ${title}.mp3`;
    if (title) return `${title}.mp3`;
    return item.name;
  }
  return item.name;
}

saveBtn.addEventListener('click', async () => {
  const item = currentItem();
  if (!item) return;
  if (!item.pending) {
    showError('File is still being parsed.');
    return;
  }
  saveBtn.disabled = true;
  statusEl.textContent = 'Writing tags…';
  try {
    const blob = await writeTagsForItem(item);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputFilename(item);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    statusEl.textContent = 'Saved.';
  } catch (err) {
    showError(`Save failed: ${err.message || err}`);
    statusEl.textContent = '';
  } finally {
    saveBtn.disabled = false;
    setTimeout(() => {
      if (statusEl.textContent === 'Saved.') statusEl.textContent = '';
    }, 3000);
  }
});

saveAllBtn.addEventListener('click', async () => {
  if (items.length === 0) return;
  saveAllBtn.disabled = true;
  saveBtn.disabled = true;
  statusEl.textContent = `Writing ${items.length} file${items.length === 1 ? '' : 's'}…`;
  const entries = [];
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.pending) {
      errors.push(`${item.name}: still parsing`);
      continue;
    }
    try {
      statusEl.textContent = `Writing ${i + 1}/${items.length}: ${item.name}`;
      const blob = await writeTagsForItem(item);
      entries.push({ name: outputFilename(item), blob });
    } catch (err) {
      errors.push(`${item.name}: ${err.message || err}`);
    }
  }
  if (entries.length === 0) {
    showError(`No files written. ${errors.join('; ')}`);
    statusEl.textContent = '';
    saveAllBtn.disabled = false;
    saveBtn.disabled = false;
    return;
  }
  try {
    statusEl.textContent = 'Building zip…';
    const zip = await buildStoreZip(entries);
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mp3-tagged.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    statusEl.textContent = errors.length
      ? `Saved ${entries.length} · ${errors.length} failed`
      : `Saved ${entries.length}.`;
    if (errors.length) showError(errors.join('; '));
  } catch (err) {
    showError(`Zip build failed: ${err.message || err}`);
    statusEl.textContent = '';
  } finally {
    saveAllBtn.disabled = false;
    saveBtn.disabled = false;
    setTimeout(() => (statusEl.textContent = ''), 4000);
  }
});

// ── Drop / paste / file input ───────────────────────────────────────────────
async function handleFiles(fileList) {
  hideError();
  const accepted = [];
  const rejected = [];
  for (const f of fileList) {
    if (/\.mp3$/i.test(f.name) || f.type === 'audio/mpeg' || f.type === 'audio/mp3') {
      accepted.push(f);
    } else {
      rejected.push(f.name);
    }
  }
  if (rejected.length) {
    showError(`Not an MP3: ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}`);
  }
  if (accepted.length === 0) return;
  for (const f of accepted) {
    await addFile(f); // sequential — keeps the parsing order stable
  }
  // Auto-select the first file if nothing's selected yet
  if (!selectedId && items.length > 0) selectFile(items[0].id);
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) handleFiles([...fileInput.files]);
  fileInput.value = '';
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer?.files?.length) handleFiles([...e.dataTransfer.files]);
});
document.addEventListener('paste', (e) => {
  if (!e.clipboardData?.files?.length) return;
  // Only accept on this page — paste-anywhere
  handleFiles([...e.clipboardData.files]);
});

clearBtn.addEventListener('click', () => {
  if (items.length === 0) return;
  items.length = 0;
  selectedId = null;
  lastUndo = null;
  filesList.innerHTML = '';
  editorForm.classList.add('hidden');
  editorEmpty.classList.remove('hidden');
  statusEl.textContent = '';
  hideError();
  updateView();
  updateToolbarState();
});

function updateView() {
  const n = items.length;
  if (n === 0) {
    appPanel.classList.add('hidden');
    toolbar.classList.add('hidden');
    dropZone.classList.remove('compact', 'p-3');
    dropEmpty.classList.remove('hidden');
    dropCompact.classList.add('hidden');
    return;
  }
  appPanel.classList.remove('hidden');
  toolbar.classList.remove('hidden');
  dropZone.classList.add('compact', 'p-3');
  dropEmpty.classList.add('hidden');
  dropCompact.classList.remove('hidden');
  fileCountEl.textContent = `(${n})`;
}

// Initial state
updateView();
updateToolbarState();
