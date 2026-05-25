import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDF_WORKER_URL__;

// ── State ──────────────────────────────────────────────────────────────────
let pdfBytes = null;
let pdfJsDoc = null;
let srcFileName = 'document.pdf';
let currentPage = 1;
let totalPages = 0;
let pageScaleX = 1;
let pageScaleY = 1;

let activeTab = 'draw';
let uploadBitmap = null;
let isDrawing = false;
let drawPaths = [];
let currentPath = null;

let ov = { x: 50, y: 50, w: 200, h: 80 };
let dragState = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const errorBar = document.getElementById('error-bar');
const pdfDrop = document.getElementById('pdf-drop');
const pdfFileInput = document.getElementById('pdf-file-input');
const pdfPanel = document.getElementById('pdf-panel');
const pageLabel = document.getElementById('page-label');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const clearPdfBtn = document.getElementById('clear-pdf');
const pdfCanvas = document.getElementById('pdf-canvas');
const previewWrap = document.getElementById('preview-wrap');
const downloadBtn = document.getElementById('download-btn');
const dlStatus = document.getElementById('dl-status');
const sigCanvas = document.getElementById('sig-canvas');
const sigCtx = sigCanvas.getContext('2d');
const typePreview = document.getElementById('type-preview');
const sigColorInput = document.getElementById('sig-color');
const sigColorBtn = document.getElementById('sig-color-btn');
const sigColorHex = document.getElementById('sig-color-hex');
const sigOpacity = document.getElementById('sig-opacity');
const sigOpacityVal = document.getElementById('sig-opacity-val');
const penWidth = document.getElementById('pen-width');
const penWidthVal = document.getElementById('pen-width-val');
const clearDrawBtn = document.getElementById('clear-draw');
const typeText = document.getElementById('type-text');
const typeFont = document.getElementById('type-font');
const sigUploadZone = document.getElementById('sig-upload-zone');
const sigUploadInput = document.getElementById('sig-upload-input');
const sigUploadThumb = document.getElementById('sig-upload-thumb');
const ovX = document.getElementById('ov-x');
const ovY = document.getElementById('ov-y');
const ovW = document.getElementById('ov-w');
const ovH = document.getElementById('ov-h');

// ── Helpers ────────────────────────────────────────────────────────────────
function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 6000);
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((res) => canvas.toBlob(res, type));
}

// ── Draw tab ───────────────────────────────────────────────────────────────
function resizeSigCanvas() {
  const rect = sigCanvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = devicePixelRatio || 1;
  sigCanvas.width = Math.round(rect.width * dpr);
  sigCanvas.height = Math.round(rect.height * dpr);
  redrawSigCanvas();
}

function redrawSigCanvas() {
  const dpr = devicePixelRatio || 1;
  sigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sigCtx.clearRect(0, 0, sigCanvas.width / dpr, sigCanvas.height / dpr);
  sigCtx.strokeStyle = sigColorInput.value;
  sigCtx.globalAlpha = parseFloat(sigOpacity.value);
  sigCtx.lineWidth = parseFloat(penWidth.value);
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  for (const path of drawPaths) {
    if (path.length < 2) continue;
    sigCtx.beginPath();
    sigCtx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) sigCtx.lineTo(path[i].x, path[i].y);
    sigCtx.stroke();
  }
  if (currentPath && currentPath.length >= 2) {
    sigCtx.beginPath();
    sigCtx.moveTo(currentPath[0].x, currentPath[0].y);
    for (let i = 1; i < currentPath.length; i++) sigCtx.lineTo(currentPath[i].x, currentPath[i].y);
    sigCtx.stroke();
  }
}

function getSigCanvasPos(e) {
  const r = sigCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

sigCanvas.addEventListener('pointerdown', (e) => {
  isDrawing = true;
  currentPath = [getSigCanvasPos(e)];
  sigCanvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

sigCanvas.addEventListener('pointermove', (e) => {
  if (!isDrawing) return;
  currentPath.push(getSigCanvasPos(e));
  redrawSigCanvas();
  e.preventDefault();
});

sigCanvas.addEventListener('pointerup', () => {
  if (isDrawing && currentPath) {
    if (currentPath.length === 1) {
      // Single tap — draw a dot
      currentPath.push({ x: currentPath[0].x + 0.1, y: currentPath[0].y });
    }
    drawPaths.push(currentPath);
    currentPath = null;
    isDrawing = false;
  }
});

sigCanvas.addEventListener('pointercancel', () => {
  currentPath = null;
  isDrawing = false;
});

clearDrawBtn.addEventListener('click', () => {
  drawPaths = [];
  currentPath = null;
  redrawSigCanvas();
});

const sigCanvasObserver = new ResizeObserver(() => resizeSigCanvas());
sigCanvasObserver.observe(sigCanvas);

// ── Type tab ───────────────────────────────────────────────────────────────
function renderTypePreview() {
  const rect = typePreview.getBoundingClientRect();
  if (!rect.width) return;
  const text = typeText.value.trim() || 'Your Signature';
  const font = typeFont.value;
  const color = sigColorInput.value;
  const opacity = parseFloat(sigOpacity.value);

  const dpr = window.devicePixelRatio || 1;
  const physW = Math.round(rect.width * dpr);
  const physH = Math.round(rect.height * dpr);
  if (typePreview.width !== physW) typePreview.width = physW;
  if (typePreview.height !== physH) typePreview.height = physH;

  const ctx = typePreview.getContext('2d');
  ctx.clearRect(0, 0, physW, physH);

  let fs = physH * 0.65;
  ctx.font = `${fs}px ${font}`;
  while (ctx.measureText(text).width > physW * 0.9 && fs > 10 * dpr) {
    fs -= 1;
    ctx.font = `${fs}px ${font}`;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, physW / 2, physH / 2);
  ctx.restore();
}

typeText.addEventListener('input', renderTypePreview);
typeFont.addEventListener('change', renderTypePreview);

const typePreviewObserver = new ResizeObserver(() => renderTypePreview());
typePreviewObserver.observe(typePreview);

// ── Upload tab ─────────────────────────────────────────────────────────────
async function handleSigUpload(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const bmp = await createImageBitmap(file);
  uploadBitmap = bmp;
  const url = URL.createObjectURL(file);
  sigUploadThumb.src = url;
  sigUploadThumb.classList.remove('hidden');
}

sigUploadZone.addEventListener('click', () => sigUploadInput.click());
sigUploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') sigUploadInput.click();
});
sigUploadInput.addEventListener('change', () => {
  if (sigUploadInput.files[0]) handleSigUpload(sigUploadInput.files[0]);
});
sigUploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  sigUploadZone.classList.add('dragover');
});
sigUploadZone.addEventListener('dragleave', () => sigUploadZone.classList.remove('dragover'));
sigUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  sigUploadZone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) handleSigUpload(f);
});

// ── Tabs ───────────────────────────────────────────────────────────────────
const tabBtns = {
  draw: document.getElementById('tab-draw'),
  type: document.getElementById('tab-type'),
  upload: document.getElementById('tab-upload'),
};
const tabPanels = {
  draw: document.getElementById('panel-draw'),
  type: document.getElementById('panel-type'),
  upload: document.getElementById('panel-upload'),
};

function switchTab(tab) {
  activeTab = tab;
  for (const [k, btn] of Object.entries(tabBtns)) {
    btn.classList.toggle('tab-btn-active', k === tab);
    btn.setAttribute('aria-selected', k === tab ? 'true' : 'false');
  }
  for (const [k, panel] of Object.entries(tabPanels)) {
    panel.classList.toggle('on', k === tab);
  }
  if (tab === 'type') requestAnimationFrame(renderTypePreview);
}

tabBtns.draw.addEventListener('click', () => switchTab('draw'));
tabBtns.type.addEventListener('click', () => switchTab('type'));
tabBtns.upload.addEventListener('click', () => switchTab('upload'));

// ── Appearance controls ────────────────────────────────────────────────────
sigColorInput.addEventListener('input', () => {
  sigColorBtn.style.setProperty('--color-btn-c', sigColorInput.value);
  sigColorHex.textContent = sigColorInput.value.slice(1).toUpperCase();
  redrawSigCanvas();
  renderTypePreview();
});

sigOpacity.addEventListener('input', () => {
  const pct = Math.round(parseFloat(sigOpacity.value) * 100);
  sigOpacityVal.textContent = `${pct}%`;
  redrawSigCanvas();
  renderTypePreview();
});

penWidth.addEventListener('input', () => {
  penWidthVal.textContent = penWidth.value;
  redrawSigCanvas();
});

// ── PDF rendering ──────────────────────────────────────────────────────────
async function renderPage(num) {
  const page = await pdfJsDoc.getPage(num);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(700 / viewport.width, 2);
  const vp = page.getViewport({ scale });

  pdfCanvas.width = Math.round(vp.width);
  pdfCanvas.height = Math.round(vp.height);
  const ctx = pdfCanvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  pageScaleX = vp.width / viewport.width;
  pageScaleY = vp.height / viewport.height;

  const ow = Math.round(vp.width * 0.4);
  const oh = Math.round(ow * 0.3);
  ov = {
    x: Math.round((vp.width - ow) / 2),
    y: Math.round((vp.height - oh) / 2),
    w: ow,
    h: oh,
  };
  syncOverlayEl();
  syncInputsFromOv();
}

// ── Overlay ────────────────────────────────────────────────────────────────
function syncOverlayEl() {
  const el = document.getElementById('sig-overlay');
  if (!el) return;
  el.style.left = `${ov.x}px`;
  el.style.top = `${ov.y}px`;
  el.style.width = `${ov.w}px`;
  el.style.height = `${ov.h}px`;
}

function syncInputsFromOv() {
  ovX.value = Math.round(ov.x / pageScaleX);
  ovY.value = Math.round((pdfCanvas.height - ov.y - ov.h) / pageScaleY);
  ovW.value = Math.round(ov.w / pageScaleX);
  ovH.value = Math.round(ov.h / pageScaleY);
}

function syncOvFromInputs() {
  const xPt = parseFloat(ovX.value) || 0;
  const yPt = parseFloat(ovY.value) || 0;
  const wPt = parseFloat(ovW.value) || 50;
  const hPt = parseFloat(ovH.value) || 20;
  const maxX = pdfCanvas.offsetWidth;
  const maxY = pdfCanvas.offsetHeight;
  ov.w = Math.max(20, wPt * pageScaleX);
  ov.h = Math.max(10, hPt * pageScaleY);
  ov.x = Math.max(0, Math.min(maxX - ov.w, xPt * pageScaleX));
  // PDF origin is bottom-left; canvas origin is top-left — flip Y
  ov.y = Math.max(0, Math.min(maxY - ov.h, maxY - (yPt + hPt) * pageScaleY));
  syncOverlayEl();
}

['ov-x', 'ov-y', 'ov-w', 'ov-h'].forEach((id) => {
  document.getElementById(id).addEventListener('input', syncOvFromInputs);
});

function createOverlay() {
  const existing = document.getElementById('sig-overlay');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'sig-overlay';
  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((d) => {
    const h = document.createElement('div');
    h.className = `rh rh-${d}`;
    h.dataset.dir = d;
    el.appendChild(h);
  });
  previewWrap.appendChild(el);
  wireOverlayEvents(el);
  syncOverlayEl();
}

function wireOverlayEvents(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('rh')) return;
    dragState = { type: 'move', startX: e.clientX, startY: e.clientY, startOv: { ...ov } };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  el.querySelectorAll('.rh').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      dragState = {
        type: 'resize',
        dir: h.dataset.dir,
        startX: e.clientX,
        startY: e.clientY,
        startOv: { ...ov },
      };
      h.setPointerCapture(e.pointerId);
      e.stopPropagation();
      e.preventDefault();
    });
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const so = dragState.startOv;
    const maxX = pdfCanvas.offsetWidth;
    const maxY = pdfCanvas.offsetHeight;
    const MIN = 20;
    let { x: nx, y: ny, w: nw, h: nh } = so;

    if (dragState.type === 'move') {
      nx = Math.max(0, Math.min(maxX - nw, so.x + dx));
      ny = Math.max(0, Math.min(maxY - nh, so.y + dy));
    } else {
      const dir = dragState.dir;
      if (dir.includes('e')) {
        nw = Math.max(MIN, so.w + dx);
      }
      if (dir.includes('s')) {
        nh = Math.max(MIN, so.h + dy);
      }
      if (dir.includes('w')) {
        const dw = Math.min(so.w - MIN, -dx);
        nx = so.x + dw;
        nw = so.w - dw;
      }
      if (dir.includes('n')) {
        const dh = Math.min(so.h - MIN, -dy);
        ny = so.y + dh;
        nh = so.h - dh;
      }
      if (nx < 0) {
        nw += nx;
        nx = 0;
      }
      if (ny < 0) {
        nh += ny;
        ny = 0;
      }
      if (nx + nw > maxX) nw = maxX - nx;
      if (ny + nh > maxY) nh = maxY - ny;
    }

    ov = { x: nx, y: ny, w: nw, h: nh };
    syncOverlayEl();
    syncInputsFromOv();
  });

  el.addEventListener('pointerup', () => {
    dragState = null;
  });
  el.addEventListener('pointercancel', () => {
    dragState = null;
  });
}

// ── Signature PNG ──────────────────────────────────────────────────────────
async function getSignaturePng() {
  const opacity = parseFloat(sigOpacity.value);

  if (activeTab === 'draw') {
    if (!drawPaths.length) return null;
    return new Uint8Array(await (await canvasToBlob(sigCanvas)).arrayBuffer());
  }

  if (activeTab === 'type') {
    const text = typeText.value.trim();
    if (!text) return null;
    return new Uint8Array(await (await canvasToBlob(typePreview)).arrayBuffer());
  }

  if (activeTab === 'upload' && uploadBitmap) {
    const c = new OffscreenCanvas(uploadBitmap.width, uploadBitmap.height);
    const ctx = c.getContext('2d');
    ctx.globalAlpha = opacity;
    ctx.drawImage(uploadBitmap, 0, 0);
    return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  }

  return null;
}

// ── Download ───────────────────────────────────────────────────────────────
async function downloadSignedPdf() {
  if (!pdfBytes) return;
  dlStatus.textContent = 'Processing…';
  downloadBtn.disabled = true;

  try {
    const sigPngBytes = await getSignaturePng();
    if (!sigPngBytes) {
      showError('Please create a signature first.');
      dlStatus.textContent = '';
      downloadBtn.disabled = false;
      return;
    }

    const doc = await PDFDocument.load(pdfBytes);
    const page = doc.getPage(currentPage - 1);
    const { width: pageW, height: pageH } = page.getSize();

    // pdfCanvas.width/height are in CSS px * dpr but we treat them as px at scale 1
    // for consistent coordinate mapping use the rendered canvas logical dimensions
    const canvasW = pdfCanvas.width;
    const canvasH = pdfCanvas.height;
    const scaleX = pageW / canvasW;
    const scaleY = pageH / canvasH;

    const pdfX = ov.x * scaleX;
    const pdfY = (canvasH - ov.y - ov.h) * scaleY;
    const pdfW = ov.w * scaleX;
    const pdfH = ov.h * scaleY;

    const pdfImg = await doc.embedPng(sigPngBytes);
    page.drawImage(pdfImg, { x: pdfX, y: pdfY, width: pdfW, height: pdfH });

    const outBytes = await doc.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = srcFileName.replace(/\.pdf$/i, '') + '-signed.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    dlStatus.textContent = 'Done!';
    setTimeout(() => {
      dlStatus.textContent = '';
    }, 3000);
  } catch (err) {
    showError(`Failed to sign PDF: ${err.message}`);
    dlStatus.textContent = '';
  } finally {
    downloadBtn.disabled = false;
  }
}

downloadBtn.addEventListener('click', downloadSignedPdf);

// ── PDF loading ────────────────────────────────────────────────────────────
async function loadPdf(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showError('Only PDF files are accepted.');
    return;
  }

  srcFileName = file.name;
  pdfBytes = new Uint8Array(await file.arrayBuffer());

  try {
    pdfJsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  } catch (err) {
    showError(`Could not read PDF: ${err.message}`);
    pdfBytes = null;
    return;
  }

  totalPages = pdfJsDoc.numPages;
  currentPage = 1;

  pdfDrop.classList.add('hidden');
  pdfPanel.classList.remove('hidden');
  pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = true;
  nextPageBtn.disabled = totalPages <= 1;

  await renderPage(currentPage);
  createOverlay();
}

function resetPdf() {
  pdfBytes = null;
  pdfJsDoc = null;
  srcFileName = 'document.pdf';
  currentPage = 1;
  totalPages = 0;
  const existing = document.getElementById('sig-overlay');
  if (existing) existing.remove();
  pdfPanel.classList.add('hidden');
  pdfDrop.classList.remove('hidden');
  dlStatus.textContent = '';
}

async function goToPage(num) {
  currentPage = num;
  pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
  await renderPage(currentPage);
  createOverlay();
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) goToPage(currentPage - 1);
});
nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) goToPage(currentPage + 1);
});
clearPdfBtn.addEventListener('click', resetPdf);

// ── PDF drop zone ──────────────────────────────────────────────────────────
pdfDrop.addEventListener('click', () => pdfFileInput.click());
pdfDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') pdfFileInput.click();
});
pdfFileInput.addEventListener('change', () => {
  if (pdfFileInput.files[0]) loadPdf(pdfFileInput.files[0]);
});
pdfDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  pdfDrop.classList.add('dragover');
});
pdfDrop.addEventListener('dragleave', () => pdfDrop.classList.remove('dragover'));
pdfDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  pdfDrop.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) loadPdf(f);
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && activeTab === 'draw' && !e.shiftKey) {
    if (drawPaths.length) {
      drawPaths.pop();
      redrawSigCanvas();
    }
    e.preventDefault();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
resizeSigCanvas();
renderTypePreview();
