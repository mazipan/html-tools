import { PDFDocument, degrees } from 'pdf-lib';

// ── State ──────────────────────────────────────────────────────────────────
let srcDoc = null;
let srcFile = null;
let pages = [];     // Array<{ sourceIndex: number, rotation: 0|90|180|270 }>
let origPages = []; // snapshot for reset
let undoStack = [];
let redoStack = [];
let dragSrcIdx = null;

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

// ── Grid rendering ─────────────────────────────────────────────────────────
function renderGrid() {
  pageGrid.innerHTML = '';
  pages.forEach((pg, idx) => {
    const tile = document.createElement('div');
    tile.className = 'pg-tile';
    tile.draggable = true;
    tile.tabIndex = 0;
    tile.dataset.idx = idx;
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
        <button class="btn btn-sm pg-rotate-btn" title="Rotate 90° clockwise" aria-label="Rotate page ${idx + 1} clockwise">↻</button>
        <button class="btn btn-sm pg-delete-btn" title="Delete this page" aria-label="Delete page ${idx + 1}"${pages.length <= 1 ? ' disabled' : ''}>✕</button>
      </div>
      <div class="pg-arrow-btns">
        <button class="btn btn-sm pg-up-btn" title="Move up" aria-label="Move page ${idx + 1} up"${idx === 0 ? ' disabled' : ''}>↑</button>
        <button class="btn btn-sm pg-down-btn" title="Move down" aria-label="Move page ${idx + 1} down"${idx === pages.length - 1 ? ' disabled' : ''}>↓</button>
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

    pageGrid.appendChild(tile);
  });
}

// ── PDF loading ────────────────────────────────────────────────────────────
async function loadPdf(file) {
  dlBtn.disabled = true;
  dlStatus.textContent = 'Loading…';
  errorBar.classList.add('hidden');
  try {
    const buf = await file.arrayBuffer();
    srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
    srcFile = file;
    const pageCount = srcDoc.getPageCount();

    pages = Array.from({ length: pageCount }, (_, i) => {
      const rawAngle = srcDoc.getPage(i).getRotation().angle;
      const rot = ((rawAngle % 360) + 360) % 360;
      return { sourceIndex: i, rotation: [0, 90, 180, 270].includes(rot) ? rot : 0 };
    });
    origPages = pages.map(p => ({ ...p }));
    undoStack = [];
    redoStack = [];

    const stem = file.name.replace(/\.pdf$/i, '');
    outName.value = `${stem}-reordered.pdf`;
    infoBar.textContent = `${file.name} · ${pageCount} page${pageCount !== 1 ? 's' : ''} · ${formatBytes(file.size)}`;

    renderGrid();
    syncUndoRedo();
    controls.classList.remove('hidden');
    dlStatus.textContent = '';
    dlBtn.disabled = false;
  } catch (err) {
    showError(`Could not load PDF: ${err.message || err}`);
    dlStatus.textContent = '';
    dlBtn.disabled = false;
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
  srcDoc = null; srcFile = null; pages = []; origPages = [];
  undoStack = []; redoStack = [];
  pageGrid.innerHTML = '';
  controls.classList.add('hidden');
  dlStatus.textContent = '';
  dlBtn.disabled = true;
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
