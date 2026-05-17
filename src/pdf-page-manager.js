import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// The pdfjs worker is copied to dist/ as a static hashed .js file by
// scripts/build.mjs and its URL is injected into the HTML at build time.
pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDF_WORKER_URL__;

// ── State ──────────────────────────────────────────────────────────────────
let srcDoc = null;
let pdfJsDoc = null;
let srcFile = null;
let pages = [];     // Array<{ sourceIndex: number, rotation: 0|90|180|270 }>
let origPages = []; // snapshot for reset
let undoStack = [];
let redoStack = [];
let dragSrcIdx = null;
const thumbCache = new Map(); // 0-based sourceIndex → dataURL

// ── DOM refs ───────────────────────────────────────────────────────────────
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controls  = document.getElementById('controls');
const infoBar   = document.getElementById('info-bar');
const pageGrid  = document.getElementById('page-grid');
const undoBtn   = document.getElementById('undo-btn');
const redoBtn   = document.getElementById('redo-btn');
const resetBtn  = document.getElementById('reset-btn');
const clearBtn  = document.getElementById('clear-btn');
const outName   = document.getElementById('out-name');
const dlBtn     = document.getElementById('dl-btn');
const dlStatus  = document.getElementById('dl-status');
const errorBar  = document.getElementById('error-bar');

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

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function rotLabel(r) {
  if (r === 90) return '↻ 90°';
  if (r === 180) return '↻ 180°';
  if (r === 270) return '↺ 90°';
  return '';
}

// ── Undo / Redo ────────────────────────────────────────────────────────────
function snapshot() {
  undoStack.push(pages.map(p => ({ ...p })));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  syncUndoRedo();
}

function syncUndoRedo() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(pages.map(p => ({ ...p })));
  pages = undoStack.pop();
  syncUndoRedo();
  renderGrid();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(pages.map(p => ({ ...p })));
  pages = redoStack.pop();
  syncUndoRedo();
  renderGrid();
}

// ── Page mutations ─────────────────────────────────────────────────────────
function rotatePage(idx, delta) {
  snapshot();
  pages[idx] = { ...pages[idx], rotation: (pages[idx].rotation + delta + 360) % 360 };
  renderGrid();
}

function deletePage(idx) {
  if (pages.length <= 1) { showError('Cannot delete the only remaining page.'); return; }
  snapshot();
  pages.splice(idx, 1);
  renderGrid();
}

function movePage(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  snapshot();
  const [moved] = pages.splice(fromIdx, 1);
  pages.splice(toIdx, 0, moved);
  renderGrid();
}

function rotateAll(delta) {
  snapshot();
  pages = pages.map(p => ({ ...p, rotation: (p.rotation + delta + 360) % 360 }));
  renderGrid();
}

function resetPages() {
  pages = origPages.map(p => ({ ...p }));
  undoStack = [];
  redoStack = [];
  syncUndoRedo();
  renderGrid();
}

// ── Thumbnail rendering ────────────────────────────────────────────────────
async function renderThumb(sourceIdx, faceEl, rotation) {
  const cacheKey = sourceIdx;
  if (thumbCache.has(cacheKey)) {
    applyThumb(faceEl, thumbCache.get(cacheKey), rotation);
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
    thumbCache.set(cacheKey, dataUrl);
    applyThumb(faceEl, dataUrl, rotation);
  } catch {
    // keep placeholder on error
  }
}

function applyThumb(faceEl, dataUrl, rotation) {
  const img = document.createElement('img');
  img.src = dataUrl;
  img.className = 'pg-thumb';
  img.alt = '';
  img.draggable = false;
  if (rotation) img.style.transform = `rotate(${rotation}deg)`;
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
      const rotation = parseInt(tile.dataset.rotation, 10) || 0;
      const faceEl = tile.querySelector('.pg-face');
      if (faceEl) renderThumb(sourceIdx, faceEl, rotation);
      thumbObserver.unobserve(tile);
    });
  }, { rootMargin: '300px' });

  pages.forEach((pg, idx) => {
    const tile = document.createElement('div');
    tile.className = 'pg-tile';
    tile.draggable = true;
    tile.tabIndex = 0;
    tile.dataset.idx = idx;
    tile.dataset.sourceIdx = pg.sourceIndex;
    tile.dataset.rotation = pg.rotation;
    tile.setAttribute('role', 'listitem');
    tile.setAttribute('aria-label', `Page ${idx + 1}${pg.rotation ? `, rotated ${pg.rotation}°` : ''}`);

    const rot = rotLabel(pg.rotation);
    tile.innerHTML = `
      <div class="pg-drag-handle" aria-hidden="true">⠿</div>
      <div class="pg-face">
        <span>📄</span>
        <span class="pg-badge">${idx + 1}</span>
      </div>
      ${rot ? `<div class="pg-rot-label">${rot}</div>` : ''}
      <div class="pg-actions">
        <button class="btn btn-icon pg-rotate-btn" title="Rotate 90° clockwise" aria-label="Rotate page ${idx + 1} clockwise">↻</button>
        <button class="btn btn-icon pg-delete-btn" title="Delete this page" aria-label="Delete page ${idx + 1}"${pages.length <= 1 ? ' disabled' : ''}>✕</button>
      </div>
      <div class="pg-arrow-btns">
        <button class="btn btn-icon pg-up-btn" title="Move up" aria-label="Move page ${idx + 1} up"${idx === 0 ? ' disabled' : ''}>↑</button>
        <button class="btn btn-icon pg-down-btn" title="Move down" aria-label="Move page ${idx + 1} down"${idx === pages.length - 1 ? ' disabled' : ''}>↓</button>
      </div>`;

    tile.querySelector('.pg-rotate-btn').addEventListener('click', e => { e.stopPropagation(); rotatePage(idx, 90); });
    tile.querySelector('.pg-delete-btn').addEventListener('click', e => { e.stopPropagation(); deletePage(idx); });
    tile.querySelector('.pg-up-btn').addEventListener('click', e => { e.stopPropagation(); movePage(idx, idx - 1); });
    tile.querySelector('.pg-down-btn').addEventListener('click', e => { e.stopPropagation(); movePage(idx, idx + 1); });

    tile.addEventListener('keydown', e => {
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotatePage(idx, 90); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deletePage(idx); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = pageGrid.querySelector(`[data-idx="${idx - 1}"]`);
        if (prev) prev.focus();
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = pageGrid.querySelector(`[data-idx="${idx + 1}"]`);
        if (next) next.focus();
      }
    });

    // HTML5 drag-and-drop reorder
    tile.addEventListener('dragstart', e => {
      dragSrcIdx = idx;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      pageGrid.querySelectorAll('.pg-tile').forEach(t => t.classList.remove('drag-over'));
    });
    tile.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrcIdx !== idx) tile.classList.add('drag-over');
    });
    tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
    tile.addEventListener('drop', e => {
      e.preventDefault();
      tile.classList.remove('drag-over');
      if (dragSrcIdx != null && dragSrcIdx !== idx) movePage(dragSrcIdx, idx);
      dragSrcIdx = null;
    });

    // Show cached thumb immediately; otherwise observe for lazy load
    if (thumbCache.has(pg.sourceIndex)) {
      const faceEl = tile.querySelector('.pg-face');
      if (faceEl) applyThumb(faceEl, thumbCache.get(pg.sourceIndex), pg.rotation);
    } else {
      thumbObserver.observe(tile);
    }

    pageGrid.appendChild(tile);
  });
}

// ── PDF loading ────────────────────────────────────────────────────────────
async function loadPdf(file) {
  dlBtn.classList.add('hidden');
  dlStatus.textContent = 'Loading…';
  errorBar.classList.add('hidden');
  try {
    const buf = await file.arrayBuffer();
    srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
    srcFile = file;
    const pageCount = srcDoc.getPageCount();
    thumbCache.clear();

    pages = Array.from({ length: pageCount }, (_, i) => {
      const rawAngle = srcDoc.getPage(i).getRotation().angle;
      const rot = ((rawAngle % 360) + 360) % 360;
      return { sourceIndex: i, rotation: [0, 90, 180, 270].includes(rot) ? rot : 0 };
    });
    origPages = pages.map(p => ({ ...p }));
    undoStack = [];
    redoStack = [];

    // Load pdfjs doc for thumbnails
    if (pdfJsDoc) { pdfJsDoc.destroy(); pdfJsDoc = null; }
    pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

    const stem = file.name.replace(/\.pdf$/i, '');
    outName.value = `${stem}-reordered.pdf`;
    infoBar.textContent = `${file.name} · ${pageCount} page${pageCount !== 1 ? 's' : ''} · ${formatBytes(file.size)}`;

    renderGrid();
    syncUndoRedo();
    controls.classList.remove('hidden');
    dlStatus.textContent = '';
    dlBtn.classList.remove('hidden');
  } catch (err) {
    showError(`Could not load PDF: ${err.message || err}`);
    dlStatus.textContent = '';
  }
}

// ── Build & download ───────────────────────────────────────────────────────
async function buildAndDownload() {
  if (!srcDoc || pages.length === 0) return;
  dlBtn.disabled = true;
  errorBar.classList.add('hidden');
  dlStatus.textContent = 'Building PDF…';
  try {
    const out = await PDFDocument.create();
    for (const { sourceIndex, rotation } of pages) {
      const [copied] = await out.copyPages(srcDoc, [sourceIndex]);
      copied.setRotation(degrees(rotation));
      out.addPage(copied);
    }
    const bytes = await out.save();
    triggerDownload(new Blob([bytes], { type: 'application/pdf' }), outName.value.trim() || 'reordered.pdf');
    dlStatus.textContent = `Done — ${formatBytes(bytes.length)}`;
  } catch (err) {
    showError(err.message || String(err));
    dlStatus.textContent = '';
    console.error(err);
  } finally {
    dlBtn.disabled = false;
  }
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

clearBtn.addEventListener('click', () => {
  if (pdfJsDoc) { pdfJsDoc.destroy(); pdfJsDoc = null; }
  thumbCache.clear();
  if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
  srcDoc = null; srcFile = null; pages = []; origPages = [];
  undoStack = []; redoStack = [];
  pageGrid.innerHTML = '';
  controls.classList.add('hidden');
  dlStatus.textContent = '';
  dlBtn.classList.add('hidden');
  syncUndoRedo();
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
resetBtn.addEventListener('click', resetPages);

document.getElementById('rotate-all-90').addEventListener('click', () => rotateAll(90));
document.getElementById('rotate-all-180').addEventListener('click', () => rotateAll(180));
document.getElementById('rotate-all-n90').addEventListener('click', () => rotateAll(-90));

dlBtn.addEventListener('click', buildAndDownload);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
});
