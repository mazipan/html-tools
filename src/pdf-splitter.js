import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// buildStoreZip and formatBytes are classic-script globals from image-utils.js

// The pdfjs worker is copied to dist/ as a static hashed .js file by
// scripts/build.mjs and its URL is injected into the HTML at build time.
// Reading it from window avoids any Parcel url: / new URL() bundling quirks
// that produce extensionless filenames on some CI hosts.
pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDF_WORKER_URL__;

// ── State ──────────────────────────────────────────────────────────────────
let srcDoc = null;
let pdfJsDoc = null;
let srcFile = null;
let pageCount = 0;
let selectionOrder = []; // 1-based page numbers in the order they were selected
let lastClickedPage = null;
let mode = 'extract';
const thumbCache = new Map(); // 0-based sourceIndex → dataURL

// ── DOM refs ───────────────────────────────────────────────────────────────
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const controls      = document.getElementById('controls');
const infoBar       = document.getElementById('info-bar');
const rangeInput    = document.getElementById('range-input');
const pageGrid      = document.getElementById('page-grid');
const modeExtract   = document.getElementById('mode-extract');
const modeSplit     = document.getElementById('mode-split');
const groupWrap     = document.getElementById('group-wrap');
const toggleGroup   = document.getElementById('toggle-group');
const extractFnWrap = document.getElementById('extract-fn-wrap');
const splitFnWrap   = document.getElementById('split-fn-wrap');
const extractName   = document.getElementById('extract-name');
const splitName     = document.getElementById('split-name');
const dlBtn         = document.getElementById('dl-btn');
const dlStatus      = document.getElementById('dl-status');
const errorBar      = document.getElementById('error-bar');
const clearFileBtn  = document.getElementById('clear-file-btn');

// ── Helpers ────────────────────────────────────────────────────────────────
function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 6000);
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Group consecutive page numbers: [1,2,3,7,9,10] → [[1,2,3],[7],[9,10]]
function groupConsecutive(pages) {
  if (!pages.length) return [];
  const groups = [];
  let run = [pages[0]];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === pages[i - 1] + 1) run.push(pages[i]);
    else { groups.push(run); run = [pages[i]]; }
  }
  groups.push(run);
  return groups;
}

// Sorted selection → compact range string (e.g. "1-3, 5, 8-9")
function selectionToRangeString() {
  const sorted = [...selectionOrder].sort((a, b) => a - b);
  if (!sorted.length) return '';
  return groupConsecutive(sorted)
    .map(g => g.length === 1 ? `${g[0]}` : `${g[0]}-${g[g.length - 1]}`)
    .join(', ');
}

// Range string → Set of 1-based page numbers; throws on invalid input
function parseRangeString(str, max) {
  str = str.trim();
  if (!str) return new Set();
  const pages = new Set();
  for (const part of str.split(',').map(s => s.trim()).filter(Boolean)) {
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n < 1 || n > max) throw new Error(`Page ${n} out of range (1–${max})`);
      pages.add(n);
    } else if (/^(\d+)-(\d*)$/.test(part)) {
      const [, a, b] = part.match(/^(\d+)-(\d*)$/);
      const from = parseInt(a, 10), to = b ? parseInt(b, 10) : max;
      if (from < 1 || from > max) throw new Error(`Page ${from} out of range (1–${max})`);
      if (to < from || to > max) throw new Error(`Range "${part}" is invalid (max: ${max})`);
      for (let i = from; i <= to; i++) pages.add(i);
    } else {
      throw new Error(`Cannot parse "${part}" — use e.g. "1-3, 7, 9-"`);
    }
  }
  return pages;
}

// ── Thumbnail rendering ────────────────────────────────────────────────────
async function renderThumb(sourceIdx, faceEl) {
  if (thumbCache.has(sourceIdx)) {
    applyThumb(faceEl, thumbCache.get(sourceIdx));
    return;
  }
  if (!pdfJsDoc) return;
  try {
    const page = await pdfJsDoc.getPage(sourceIdx + 1);
    const viewport = page.getViewport({ scale: 1 });
    // Scale to fit ~120px wide (tile width)
    const scale = 120 / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    page.cleanup();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    thumbCache.set(sourceIdx, dataUrl);
    applyThumb(faceEl, dataUrl);
  } catch {
    // keep placeholder on error
  }
}

function applyThumb(faceEl, dataUrl) {
  const img = document.createElement('img');
  img.src = dataUrl;
  img.className = 'pg-thumb';
  img.alt = '';
  img.draggable = false;
  // replace the emoji span child (keep the badge)
  const emojiSpan = faceEl.querySelector('span:first-child');
  if (emojiSpan) faceEl.replaceChild(img, emojiSpan);
}

// ── Grid rendering ─────────────────────────────────────────────────────────
let thumbObserver = null;

function renderGrid() {
  if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
  pageGrid.innerHTML = '';

  thumbObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const tile = entry.target;
      const sourceIdx = parseInt(tile.dataset.sourceIdx, 10);
      const faceEl = tile.querySelector('.pg-face');
      if (faceEl) renderThumb(sourceIdx, faceEl);
      thumbObserver.unobserve(tile);
    });
  }, { rootMargin: '300px' });

  for (let p = 1; p <= pageCount; p++) {
    const sel = selectionOrder.includes(p);
    const tile = document.createElement('div');
    tile.className = 'pg-tile' + (sel ? ' selected' : '');
    tile.tabIndex = 0;
    tile.setAttribute('role', 'checkbox');
    tile.setAttribute('aria-checked', sel ? 'true' : 'false');
    tile.setAttribute('aria-label', `Page ${p}`);
    tile.dataset.page = p;
    tile.dataset.sourceIdx = p - 1;
    tile.innerHTML = `
      <div class="pg-face">
        <span>📄</span>
        <span class="pg-badge">${p}</span>
      </div>`;

    tile.addEventListener('click', e => handleTileClick(p, e));
    tile.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleTileClick(p, e); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = pageGrid.querySelector(`[data-page="${p + 1}"]`);
        if (next) next.focus();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = pageGrid.querySelector(`[data-page="${p - 1}"]`);
        if (prev) prev.focus();
      }
    });

    // If already cached, show immediately; otherwise observe for lazy load
    if (thumbCache.has(p - 1)) {
      const faceEl = tile.querySelector('.pg-face');
      if (faceEl) applyThumb(faceEl, thumbCache.get(p - 1));
    } else {
      thumbObserver.observe(tile);
    }

    pageGrid.appendChild(tile);
  }
}

function updateTileClasses() {
  pageGrid.querySelectorAll('.pg-tile').forEach(tile => {
    const p = parseInt(tile.dataset.page, 10);
    const sel = selectionOrder.includes(p);
    tile.classList.toggle('selected', sel);
    tile.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
}

function syncFromSelection() {
  updateTileClasses();
  rangeInput.value = selectionToRangeString();
  rangeInput.classList.remove('invalid');
  rangeInput.title = '';
}

function syncFromRangeInput() {
  try {
    const pages = parseRangeString(rangeInput.value, pageCount);
    selectionOrder = [...pages].sort((a, b) => a - b);
    rangeInput.classList.remove('invalid');
    rangeInput.title = '';
    updateTileClasses();
  } catch (e) {
    rangeInput.classList.add('invalid');
    rangeInput.title = e.message;
  }
}

// ── Selection logic ────────────────────────────────────────────────────────
function handleTileClick(p, e) {
  if (e.shiftKey && lastClickedPage != null) {
    const lo = Math.min(lastClickedPage, p);
    const hi = Math.max(lastClickedPage, p);
    for (let i = lo; i <= hi; i++) {
      if (!selectionOrder.includes(i)) selectionOrder.push(i);
    }
  } else if (e.ctrlKey || e.metaKey) {
    const idx = selectionOrder.indexOf(p);
    if (idx >= 0) selectionOrder.splice(idx, 1);
    else selectionOrder.push(p);
  } else {
    const idx = selectionOrder.indexOf(p);
    if (idx >= 0) selectionOrder.splice(idx, 1);
    else selectionOrder.push(p);
  }
  lastClickedPage = p;
  syncFromSelection();
}

// ── PDF loading ────────────────────────────────────────────────────────────
async function loadPdf(file) {
  dlBtn.classList.add('hidden');
  dlStatus.textContent = 'Loading…';
  errorBar.classList.add('hidden');
  try {
    const buf = await file.arrayBuffer();

    // Load with pdf-lib for extraction/splitting
    srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
    srcFile = file;
    pageCount = srcDoc.getPageCount();
    selectionOrder = [];
    lastClickedPage = null;
    thumbCache.clear();

    // Load with pdfjs for thumbnails (use a copy of the buffer)
    if (pdfJsDoc) { pdfJsDoc.destroy(); pdfJsDoc = null; }
    pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

    const stem = file.name.replace(/\.pdf$/i, '');
    extractName.value = `${stem}-extract.pdf`;
    splitName.value = stem;

    infoBar.textContent = `${file.name} · ${pageCount} page${pageCount !== 1 ? 's' : ''} · ${formatBytes(file.size)}`;
    renderGrid();
    controls.classList.remove('hidden');
    dlStatus.textContent = '';
    dlBtn.classList.remove('hidden');
  } catch (err) {
    showError(`Could not load PDF: ${err.message || err}`);
    dlStatus.textContent = '';
  }
}

// ── Download logic ─────────────────────────────────────────────────────────
async function doDownload() {
  if (!srcDoc) return;
  if (selectionOrder.length === 0) { showError('Select at least one page first.'); return; }

  dlBtn.disabled = true;
  errorBar.classList.add('hidden');

  try {
    if (mode === 'extract') {
      dlStatus.textContent = 'Extracting…';
      const out = await PDFDocument.create();
      const indices = selectionOrder.map(p => p - 1);
      const copied = await out.copyPages(srcDoc, indices);
      copied.forEach(p => out.addPage(p));
      const bytes = await out.save();
      triggerDownload(new Blob([bytes], { type: 'application/pdf' }), extractName.value.trim() || 'extract.pdf');
      dlStatus.textContent = `Done — ${formatBytes(bytes.length)}`;

    } else {
      const sorted = [...selectionOrder].sort((a, b) => a - b);
      const groups = toggleGroup.checked ? groupConsecutive(sorted) : sorted.map(p => [p]);
      const stem = splitName.value.trim() || 'document';

      dlStatus.textContent = `Building ${groups.length} file${groups.length !== 1 ? 's' : ''}…`;
      const entries = [];

      for (const group of groups) {
        const out = await PDFDocument.create();
        const indices = group.map(p => p - 1);
        const copied = await out.copyPages(srcDoc, indices);
        copied.forEach(p => out.addPage(p));
        const bytes = await out.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const name = group.length === 1
          ? `${stem}-page-${group[0]}.pdf`
          : `${stem}-pages-${group[0]}-${group[group.length - 1]}.pdf`;
        entries.push({ name, blob });
      }

      if (entries.length === 1) {
        triggerDownload(entries[0].blob, entries[0].name);
        dlStatus.textContent = 'Done';
      } else {
        dlStatus.textContent = 'Zipping…';
        const zipBlob = await buildStoreZip(entries);
        triggerDownload(zipBlob, `${stem}-split.zip`);
        dlStatus.textContent = `Done — ${formatBytes(zipBlob.size)}`;
      }
    }
  } catch (err) {
    showError(err.message || String(err));
    dlStatus.textContent = '';
    console.error(err);
  } finally {
    dlBtn.disabled = false;
  }
}

// ── Mode switching ─────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  modeExtract.classList.toggle('btn-active', m === 'extract');
  modeSplit.classList.toggle('btn-active', m === 'split');
  groupWrap.classList.toggle('hidden', m === 'extract');
  extractFnWrap.classList.toggle('hidden', m === 'split');
  splitFnWrap.classList.toggle('hidden', m === 'extract');
  dlBtn.textContent = m === 'extract' ? '⬇️ Download extracted PDF' : '⬇️ Download split zip';
}

// ── Event wiring ───────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const f = [...e.dataTransfer.files].find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if (f) loadPdf(f);
  else showError('Please drop a PDF file.');
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadPdf(fileInput.files[0]);
  fileInput.value = '';
});

clearFileBtn.addEventListener('click', () => {
  if (pdfJsDoc) { pdfJsDoc.destroy(); pdfJsDoc = null; }
  thumbCache.clear();
  if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
  srcDoc = null; srcFile = null; pageCount = 0; selectionOrder = []; lastClickedPage = null;
  pageGrid.innerHTML = '';
  controls.classList.add('hidden');
  dlStatus.textContent = '';
  dlBtn.classList.add('hidden');
});

document.getElementById('btn-select-all').addEventListener('click', () => {
  selectionOrder = Array.from({ length: pageCount }, (_, i) => i + 1);
  syncFromSelection();
});
document.getElementById('btn-invert').addEventListener('click', () => {
  const allPages = Array.from({ length: pageCount }, (_, i) => i + 1);
  selectionOrder = allPages.filter(p => !selectionOrder.includes(p));
  syncFromSelection();
});
document.getElementById('btn-clear-sel').addEventListener('click', () => {
  selectionOrder = [];
  syncFromSelection();
});

rangeInput.addEventListener('input', syncFromRangeInput);

modeExtract.addEventListener('click', () => setMode('extract'));
modeSplit.addEventListener('click', () => setMode('split'));

dlBtn.addEventListener('click', doDownload);
