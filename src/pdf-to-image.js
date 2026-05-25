import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// buildStoreZip and formatBytes are classic-script globals from image-utils.js

pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDF_WORKER_URL__;

// ── State ──────────────────────────────────────────────────────────────────
let pdfJsDoc = null;
let srcFile = null;
let pageCount = 0;
let selectionOrder = []; // 1-based page numbers in the order they were selected
let lastClickedPage = null;
const thumbCache = new Map(); // 0-based sourceIndex → dataURL

// ── DOM refs ───────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controls = document.getElementById('controls');
const infoBar = document.getElementById('info-bar');
const rangeInput = document.getElementById('range-input');
const pageGrid = document.getElementById('page-grid');
const fmtPng = document.getElementById('fmt-png');
const fmtJpeg = document.getElementById('fmt-jpeg');
const fmtWebp = document.getElementById('fmt-webp');
const qualityWrap = document.getElementById('quality-wrap');
const qualityRange = document.getElementById('quality-range');
const qualityVal = document.getElementById('quality-val');
const dpiButtons = document.querySelectorAll('.dpi-btn');
const dpiCustom = document.getElementById('dpi-custom');
const bgWrap = document.getElementById('bg-wrap');
const forceBgLabel = document.getElementById('force-bg-label');
const toggleForceBg = document.getElementById('toggle-force-bg');
const bgColorBtn = document.getElementById('bg-color-btn');
const bgColor = document.getElementById('bg-color');
const bgColorHex = document.getElementById('bg-color-hex');
const filenameStem = document.getElementById('filename-stem');
const progressWrap = document.getElementById('progress-wrap');
const progressCount = document.getElementById('progress-count');
const progressBarFill = document.getElementById('progress-bar-fill');
const errorBar = document.getElementById('error-bar');
const dlBtn = document.getElementById('dl-btn');
const dlStatus = document.getElementById('dl-status');
const exportStats = document.getElementById('export-stats');
const clearFileBtn = document.getElementById('clear-file-btn');

// ── Helpers ────────────────────────────────────────────────────────────────
function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 6000);
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function groupConsecutive(pages) {
  if (!pages.length) return [];
  const groups = [];
  let run = [pages[0]];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === pages[i - 1] + 1) run.push(pages[i]);
    else {
      groups.push(run);
      run = [pages[i]];
    }
  }
  groups.push(run);
  return groups;
}

function selectionToRangeString() {
  const sorted = [...selectionOrder].sort((a, b) => a - b);
  if (!sorted.length) return '';
  return groupConsecutive(sorted)
    .map((g) => (g.length === 1 ? `${g[0]}` : `${g[0]}-${g[g.length - 1]}`))
    .join(', ');
}

function parseRangeString(str, max) {
  str = str.trim();
  if (!str) return new Set();
  const pages = new Set();
  for (const part of str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n < 1 || n > max) throw new Error(`Page ${n} out of range (1–${max})`);
      pages.add(n);
    } else if (/^(\d+)-(\d*)$/.test(part)) {
      const [, a, b] = part.match(/^(\d+)-(\d*)$/);
      const from = parseInt(a, 10),
        to = b ? parseInt(b, 10) : max;
      if (from < 1 || from > max) throw new Error(`Page ${from} out of range (1–${max})`);
      if (to < from || to > max) throw new Error(`Range "${part}" is invalid (max: ${max})`);
      for (let i = from; i <= to; i++) pages.add(i);
    } else {
      throw new Error(`Cannot parse "${part}" — use e.g. "1-3, 7, 9-"`);
    }
  }
  return pages;
}

// ── Export settings ────────────────────────────────────────────────────────
function getFormat() {
  if (fmtJpeg.classList.contains('on')) return 'jpeg';
  if (fmtWebp.classList.contains('on')) return 'webp';
  return 'png';
}

function getDpi() {
  const active = document.querySelector('.dpi-btn.on');
  if (active && active.dataset.dpi !== 'custom') return parseInt(active.dataset.dpi, 10);
  return Math.max(36, Math.min(600, parseInt(dpiCustom.value, 10) || 150));
}

function getQuality() {
  return parseFloat(qualityRange.value);
}

function getBgColor() {
  const fmt = getFormat();
  if (fmt === 'jpeg') return bgColor.value || '#ffffff';
  if (toggleForceBg.checked) return bgColor.value || '#ffffff';
  return null;
}

function getExt() {
  const fmt = getFormat();
  return fmt === 'jpeg' ? 'jpg' : fmt;
}

function getMime() {
  const fmt = getFormat();
  if (fmt === 'jpeg') return 'image/jpeg';
  if (fmt === 'webp') return 'image/webp';
  return 'image/png';
}

// ── UI sync ────────────────────────────────────────────────────────────────
function updateFormatUI() {
  const fmt = getFormat();
  qualityWrap.classList.toggle('hidden', fmt === 'png');
  bgWrap.classList.remove('hidden');
  if (fmt === 'jpeg') {
    forceBgLabel.classList.add('hidden');
  } else {
    forceBgLabel.classList.remove('hidden');
  }
}

function setFormat(fmt) {
  fmtPng.classList.toggle('on', fmt === 'png');
  fmtJpeg.classList.toggle('on', fmt === 'jpeg');
  fmtWebp.classList.toggle('on', fmt === 'webp');
  updateFormatUI();
}

function setDpi(val) {
  dpiButtons.forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.dpi === val);
  });
  dpiCustom.classList.toggle('hidden', val !== 'custom');
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
  const emojiSpan = faceEl.querySelector('span:first-child');
  if (emojiSpan) faceEl.replaceChild(img, emojiSpan);
}

// ── Grid rendering ─────────────────────────────────────────────────────────
let thumbObserver = null;

function renderGrid() {
  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }
  pageGrid.innerHTML = '';

  thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const tile = entry.target;
        const sourceIdx = parseInt(tile.dataset.sourceIdx, 10);
        const faceEl = tile.querySelector('.pg-face');
        if (faceEl) renderThumb(sourceIdx, faceEl);
        thumbObserver.unobserve(tile);
      });
    },
    { rootMargin: '300px' },
  );

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

    tile.addEventListener('click', (e) => handleTileClick(p, e));
    tile.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleTileClick(p, e);
      }
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
  pageGrid.querySelectorAll('.pg-tile').forEach((tile) => {
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
  exportStats.classList.add('hidden');
  errorBar.classList.add('hidden');
  try {
    const buf = await file.arrayBuffer();

    if (pdfJsDoc) {
      pdfJsDoc.destroy();
      pdfJsDoc = null;
    }
    pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

    srcFile = file;
    pageCount = pdfJsDoc.numPages;
    selectionOrder = [];
    lastClickedPage = null;
    thumbCache.clear();

    const stem = file.name.replace(/\.pdf$/i, '');
    filenameStem.value = stem;

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

// ── Page rendering ─────────────────────────────────────────────────────────
async function renderPageToBlob(pageNum) {
  const page = await pdfJsDoc.getPage(pageNum);
  const dpi = getDpi();
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const w = Math.round(viewport.width);
  const h = Math.round(viewport.height);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const bg = getBgColor();
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();

  const mime = getMime();
  const fmt = getFormat();
  const quality = fmt === 'png' ? undefined : getQuality();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      mime,
      quality,
    );
  });
}

// Render pages with a capped-concurrency pool.
async function renderWithPool(pages, concurrency, onProgress) {
  const results = new Array(pages.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < pages.length) {
      const i = nextIdx++;
      results[i] = { pageNum: pages[i], blob: await renderPageToBlob(pages[i]) };
      onProgress(i + 1, pages.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, worker));
  return results;
}

// ── Download ───────────────────────────────────────────────────────────────
async function doDownload() {
  const pages = [...selectionOrder].sort((a, b) => a - b);
  if (!pages.length) {
    showError('Select at least one page first.');
    return;
  }

  dlBtn.disabled = true;
  exportStats.classList.add('hidden');
  progressWrap.classList.remove('hidden');
  progressBarFill.style.width = '0%';
  progressCount.textContent = `0 / ${pages.length}`;
  dlStatus.textContent = '';
  errorBar.classList.add('hidden');

  const concurrency = navigator.hardwareConcurrency || 4;
  const stem = filenameStem.value.trim() || 'page';
  const ext = getExt();

  try {
    const results = await renderWithPool(pages, concurrency, (done, total) => {
      const pct = Math.round((done / total) * 100);
      progressBarFill.style.width = `${pct}%`;
      progressCount.textContent = `${done} / ${total}`;
    });

    progressWrap.classList.add('hidden');

    const totalBytes = results.reduce((s, r) => s + r.blob.size, 0);
    const avgBytes = Math.round(totalBytes / results.length);

    if (results.length === 1) {
      const { pageNum, blob } = results[0];
      triggerDownload(blob, `${stem}-page-${pageNum}.${ext}`);
      dlStatus.textContent = `Done — ${formatBytes(blob.size)}`;
    } else {
      dlStatus.textContent = 'Zipping…';
      const entries = results.map(({ pageNum, blob }) => ({
        name: `${stem}-page-${pageNum}.${ext}`,
        blob,
      }));
      const zipBlob = await buildStoreZip(entries);
      triggerDownload(zipBlob, `${stem}-images.zip`);
      dlStatus.textContent = `Done — ${formatBytes(zipBlob.size)}`;
    }

    exportStats.textContent =
      `${results.length} page${results.length !== 1 ? 's' : ''} · ` +
      `total ${formatBytes(totalBytes)} · avg ${formatBytes(avgBytes)}/page`;
    exportStats.classList.remove('hidden');
  } catch (err) {
    showError(err.message || String(err));
    dlStatus.textContent = '';
    progressWrap.classList.add('hidden');
    console.error(err);
  } finally {
    dlBtn.disabled = false;
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const f = [...e.dataTransfer.files].find(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
  );
  if (f) loadPdf(f);
  else showError('Please drop a PDF file.');
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadPdf(fileInput.files[0]);
  fileInput.value = '';
});

clearFileBtn.addEventListener('click', () => {
  if (pdfJsDoc) {
    pdfJsDoc.destroy();
    pdfJsDoc = null;
  }
  thumbCache.clear();
  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }
  srcFile = null;
  pageCount = 0;
  selectionOrder = [];
  lastClickedPage = null;
  pageGrid.innerHTML = '';
  controls.classList.add('hidden');
  progressWrap.classList.add('hidden');
  exportStats.classList.add('hidden');
  dlStatus.textContent = '';
  dlBtn.classList.add('hidden');
});

document.getElementById('btn-select-all').addEventListener('click', () => {
  selectionOrder = Array.from({ length: pageCount }, (_, i) => i + 1);
  syncFromSelection();
});
document.getElementById('btn-invert').addEventListener('click', () => {
  const allPages = Array.from({ length: pageCount }, (_, i) => i + 1);
  selectionOrder = allPages.filter((p) => !selectionOrder.includes(p));
  syncFromSelection();
});
document.getElementById('btn-clear-sel').addEventListener('click', () => {
  selectionOrder = [];
  syncFromSelection();
});

rangeInput.addEventListener('input', syncFromRangeInput);

fmtPng.addEventListener('click', () => setFormat('png'));
fmtJpeg.addEventListener('click', () => setFormat('jpeg'));
fmtWebp.addEventListener('click', () => setFormat('webp'));

qualityRange.addEventListener('input', () => {
  qualityVal.textContent = qualityRange.value;
});

dpiButtons.forEach((btn) => {
  btn.addEventListener('click', () => setDpi(btn.dataset.dpi));
});

dpiCustom.addEventListener('focus', () => setDpi('custom'));

bgColor.addEventListener('input', () => {
  const hex = bgColor.value.replace('#', '').toUpperCase();
  bgColorHex.textContent = hex;
  bgColorBtn.style.setProperty('--color-btn-c', bgColor.value);
});

dlBtn.addEventListener('click', doDownload);

// Initialise format UI on load (PNG selected → quality hidden, bg hidden)
updateFormatUI();
bgWrap.classList.add('hidden');
