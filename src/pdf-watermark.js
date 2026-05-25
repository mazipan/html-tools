import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDF_WORKER_URL__;

const { formatBytes, buildStoreZip } = window;

const MAX_FILES = 25;
const SCALE = 2;

let previewPdfJsDoc = null;
let previewTimer = null;

const opts = {
  type: 'text',
  text: '© Watermark',
  fontFamily: 'sans-serif',
  fontSize: 48,
  color: '#ff0000',
  opacity: 0.35,
  angleDeg: 0,
  wmBitmap: null,
  imageOpacity: 0.7,
  imageScale: 20,
  position: 'mc',
  margin: 20,
  tile: false,
  density: 'normal',
  pages: '',
};

let items = [];
let idSeq = 0;

function parsePageRange(str, total) {
  if (!str || !str.trim()) return null;
  const pages = new Set();
  for (const part of str.split(',')) {
    const s = part.trim();
    if (!s) continue;
    const rangeParts = s.split('-');
    if (rangeParts.length === 1) {
      const n = parseInt(rangeParts[0], 10);
      if (!isNaN(n)) pages.add(Math.max(1, Math.min(total, n)));
    } else if (rangeParts.length === 2) {
      const from = rangeParts[0].trim();
      const to = rangeParts[1].trim();
      const start = from === '' ? 1 : parseInt(from, 10);
      const end = to === '' ? total : parseInt(to, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(total, end); i++) {
          pages.add(i);
        }
      }
    }
  }
  return pages.size > 0 ? pages : null;
}

async function makeTextStampPng({ text, fontFamily, fontSize, color, opacity, angleDeg }) {
  if (!text || !text.trim()) return null;
  const scaledSize = fontSize * SCALE;
  const tmp = new OffscreenCanvas(10, 10);
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.font = `bold ${scaledSize}px ${fontFamily}`;
  const m = tmpCtx.measureText(text);
  const tw = m.width;
  const th = scaledSize * 1.25;
  const rad = (angleDeg * Math.PI) / 180;
  const abscos = Math.abs(Math.cos(rad));
  const abssin = Math.abs(Math.sin(rad));
  const bboxW = Math.ceil(tw * abscos + th * abssin) + 4;
  const bboxH = Math.ceil(tw * abssin + th * abscos) + 4;
  const canvas = new OffscreenCanvas(bboxW, bboxH);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, bboxW, bboxH);
  ctx.save();
  ctx.translate(bboxW / 2, bboxH / 2);
  ctx.rotate(rad);
  ctx.globalAlpha = opacity;
  ctx.font = `bold ${scaledSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, pdfW: bboxW / SCALE, pdfH: bboxH / SCALE };
}

async function makeImageStampPng(bitmap, opacity) {
  const maxW = 1200;
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const dstW = Math.min(srcW, maxW);
  const dstH = Math.round((dstW / srcW) * srcH);
  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d');
  ctx.globalAlpha = opacity;
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, aspect: srcW / srcH };
}

function getStampDimensions(stampInfo, pageW, pageH) {
  if (opts.type === 'text') {
    return { w: stampInfo.pdfW, h: stampInfo.pdfH };
  }
  const short = Math.min(pageW, pageH);
  const h = (short * opts.imageScale) / 100;
  const w = stampInfo.aspect * h;
  return { w, h };
}

function computePosition(pos, pageW, pageH, stampW, stampH, margin) {
  let cx, cy;
  switch (pos) {
    case 'tl':
      cx = margin + stampW / 2;
      cy = pageH - margin - stampH / 2;
      break;
    case 'tc':
      cx = pageW / 2;
      cy = pageH - margin - stampH / 2;
      break;
    case 'tr':
      cx = pageW - margin - stampW / 2;
      cy = pageH - margin - stampH / 2;
      break;
    case 'ml':
      cx = margin + stampW / 2;
      cy = pageH / 2;
      break;
    case 'mc':
      cx = pageW / 2;
      cy = pageH / 2;
      break;
    case 'mr':
      cx = pageW - margin - stampW / 2;
      cy = pageH / 2;
      break;
    case 'bl':
      cx = margin + stampW / 2;
      cy = margin + stampH / 2;
      break;
    case 'bc':
      cx = pageW / 2;
      cy = margin + stampH / 2;
      break;
    case 'br':
      cx = pageW - margin - stampW / 2;
      cy = margin + stampH / 2;
      break;
    default:
      cx = pageW / 2;
      cy = pageH / 2;
  }
  return { x: cx - stampW / 2, y: cy - stampH / 2 };
}

function tilePositions(pageW, pageH, stampW, stampH, density) {
  const gapFactor = density === 'sparse' ? 3 : density === 'dense' ? 1.2 : 1.8;
  const stepX = stampW * gapFactor;
  const stepY = stampH * gapFactor;
  const offsetX = (pageW % stepX) / 2;
  const offsetY = (pageH % stepY) / 2;
  const positions = [];
  for (let cx = offsetX + stampW / 2; cx < pageW; cx += stepX) {
    for (let cy = offsetY + stampH / 2; cy < pageH; cy += stepY) {
      positions.push({ x: cx - stampW / 2, y: cy - stampH / 2 });
    }
  }
  return positions;
}

async function applyWatermark(file) {
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const pageSet = parsePageRange(opts.pages, pageCount);

  let stampInfo = null;
  let stampBytes = null;

  if (opts.type === 'text') {
    stampInfo = await makeTextStampPng({
      text: opts.text,
      fontFamily: opts.fontFamily,
      fontSize: opts.fontSize,
      color: opts.color,
      opacity: opts.opacity,
      angleDeg: opts.angleDeg,
    });
    if (!stampInfo) throw new Error('Text watermark is empty.');
    stampBytes = stampInfo.bytes;
  } else {
    if (!opts.wmBitmap) throw new Error('No watermark image loaded.');
    const imgInfo = await makeImageStampPng(opts.wmBitmap, opts.imageOpacity);
    stampInfo = { aspect: imgInfo.aspect };
    stampBytes = imgInfo.bytes;
  }

  // Embed once per document — pdf-lib deduplicates by ref
  const pdfImg = await doc.embedPng(stampBytes);

  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    const pageNum = pageIdx + 1;
    if (pageSet && !pageSet.has(pageNum)) continue;
    const page = doc.getPage(pageIdx);
    const { width: pageW, height: pageH } = page.getSize();
    const { w, h } = getStampDimensions(stampInfo, pageW, pageH);
    let positions;
    if (opts.tile) {
      positions = tilePositions(pageW, pageH, w, h, opts.density);
    } else {
      positions = [computePosition(opts.position, pageW, pageH, w, h, opts.margin)];
    }
    for (const { x, y } of positions) {
      // opacity=1 because it is already baked into the PNG alpha channel
      page.drawImage(pdfImg, { x, y, width: w, height: h, opacity: 1 });
    }
  }

  const outBytes = await doc.save();
  return new Blob([outBytes], { type: 'application/pdf' });
}

// ── Preview ──────────────────────────────────────────────────────────────────
async function renderPreview() {
  if (!previewPdfJsDoc || items.length !== 1) return;
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  try {
    const page = await previewPdfJsDoc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const maxW = canvas.parentElement.clientWidth || 800;
    const scale = Math.min(maxW / vp1.width, 2);
    const vp = page.getViewport({ scale });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const cH = canvas.height;
    const pdfW = vp1.width;
    const pdfH = vp1.height;

    if (opts.type === 'text' && opts.text.trim()) {
      const scaledFontSize = opts.fontSize * scale;
      const tmp = new OffscreenCanvas(10, 10);
      const tmpCtx = tmp.getContext('2d');
      tmpCtx.font = `bold ${scaledFontSize}px ${opts.fontFamily}`;
      const m = tmpCtx.measureText(opts.text);
      const tw = m.width;
      const th = scaledFontSize * 1.25;
      const rad = (opts.angleDeg * Math.PI) / 180;
      const abscos = Math.abs(Math.cos(rad));
      const abssin = Math.abs(Math.sin(rad));
      const stampW_pt = (Math.ceil(tw * abscos + th * abssin) + 4) / scale;
      const stampH_pt = (Math.ceil(tw * abssin + th * abscos) + 4) / scale;
      const positions = opts.tile
        ? tilePositions(pdfW, pdfH, stampW_pt, stampH_pt, opts.density)
        : [computePosition(opts.position, pdfW, pdfH, stampW_pt, stampH_pt, opts.margin)];
      for (const { x, y } of positions) {
        const cx = (x + stampW_pt / 2) * scale;
        const cy = cH - (y + stampH_pt / 2) * scale;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        ctx.globalAlpha = opts.opacity;
        ctx.font = `bold ${scaledFontSize}px ${opts.fontFamily}`;
        ctx.fillStyle = opts.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.text, 0, 0);
        ctx.restore();
      }
    } else if (opts.type === 'image' && opts.wmBitmap) {
      const short = Math.min(pdfW, pdfH);
      const stampH_pt = (short * opts.imageScale) / 100;
      const stampW_pt = (opts.wmBitmap.width / opts.wmBitmap.height) * stampH_pt;
      const positions = opts.tile
        ? tilePositions(pdfW, pdfH, stampW_pt, stampH_pt, opts.density)
        : [computePosition(opts.position, pdfW, pdfH, stampW_pt, stampH_pt, opts.margin)];
      for (const { x, y } of positions) {
        ctx.save();
        ctx.globalAlpha = opts.imageOpacity;
        ctx.drawImage(
          opts.wmBitmap,
          x * scale,
          cH - (y + stampH_pt) * scale,
          stampW_pt * scale,
          stampH_pt * scale,
        );
        ctx.restore();
      }
    }
  } catch (_) {
    // preview errors are non-fatal
  }
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 150);
}

async function updatePreviewDoc() {
  if (previewPdfJsDoc) {
    previewPdfJsDoc.destroy();
    previewPdfJsDoc = null;
  }
  if (items.length !== 1) return;
  try {
    const bytes = new Uint8Array(await items[0].file.arrayBuffer());
    previewPdfJsDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    schedulePreview();
  } catch (_) {
    // ignore unreadable PDFs in preview
  }
}

// ── DOM refs ────────────────────────────────────────────────────────────────
const dropZone = document.getElementById('wf-drop-zone');
const fileInput = document.getElementById('wf-file-input');
const wfList = document.getElementById('wf-list');
const errorBar = document.getElementById('wf-error-bar');
const processBtn = document.getElementById('wf-process-btn');
const zipBtn = document.getElementById('wf-zip-btn');
const statusEl = document.getElementById('wf-status');
const fileCountEl = document.getElementById('wf-file-count');

const textColorInput = document.getElementById('text-color');
const textColorBtn = document.getElementById('text-color-btn');
const textColorHex = document.getElementById('text-color-hex');
const textOpacity = document.getElementById('text-opacity');
const textOpacityVal = document.getElementById('text-opacity-val');
const imageOpacity = document.getElementById('img-opacity');
const imageOpacityVal = document.getElementById('img-opacity-val');
const wmImgDrop = document.getElementById('wm-img-drop');
const wmImgInput = document.getElementById('wm-img-input');
const wmImgEmpty = document.getElementById('wm-img-empty');
const wmImgLoaded = document.getElementById('wm-img-loaded');
const wmImgThumb = document.getElementById('wm-img-thumb');
const wmImgName = document.getElementById('wm-img-name');
const densitySection = document.getElementById('density-section');
const rotCustomInput = document.getElementById('rot-custom');
const tileToggle = document.getElementById('tile-toggle');
const pagesInput = document.getElementById('pages-input');
const marginInput = document.getElementById('margin-input');
const imgScaleInput = document.getElementById('img-scale');

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 7000);
}

function hideError() {
  errorBar.classList.add('hidden');
}

function updateFileCount() {
  fileCountEl.textContent = items.length > 0 ? `(${items.length})` : '';
}

// ── Card rendering ──────────────────────────────────────────────────────────
function badgeHtml(item) {
  switch (item.status) {
    case 'working':
      return `<span class="badge badge-working">working…</span>`;
    case 'done':
      return `<span class="badge badge-done">done</span>`;
    case 'error':
      return `<span class="badge badge-error">error</span>`;
    default:
      return `<span class="badge badge-queued">queued</span>`;
  }
}

function renderCard(item) {
  const existing = document.getElementById(`wf-${item.id}`);
  const card = existing || document.createElement('div');
  if (!existing) {
    card.id = `wf-${item.id}`;
    card.className = 'wf-card';
  }
  const dlHidden = item.status === 'done' && item.blob ? '' : 'hidden';
  card.innerHTML = `
    <div class="wf-name" title="${escHtml(item.file.name)}">${escHtml(item.file.name)}</div>
    <div class="wf-meta">${escHtml(formatBytes(item.file.size))} ${badgeHtml(item)}</div>
    ${item.error ? `<div style="font-size:0.7rem;color:#f87171;margin-top:0.2rem">${escHtml(item.error)}</div>` : ''}
    <div class="wf-actions">
      <button class="btn btn-sm btn-secondary ${dlHidden}" data-action="download" data-id="${item.id}" type="button" aria-label="Download ${escHtml(item.file.name)}">
        <svg class="icon" aria-hidden="true"><use href="#icon-download"/></svg>
      </button>
      <button class="btn btn-sm btn-danger" data-action="remove" data-id="${item.id}" type="button" aria-label="Remove">
        <svg class="icon" aria-hidden="true"><use href="#icon-trash"/></svg>
      </button>
    </div>`;
  if (!existing) wfList.appendChild(card);
}

function updateCard(item) {
  const card = document.getElementById(`wf-${item.id}`);
  if (!card) return;
  renderCard(item);
}

// ── File ingestion ──────────────────────────────────────────────────────────
function ingestFiles(files) {
  const accepted = [...files].filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
  );
  if (accepted.length === 0) {
    showError('No PDFs found. Drop one or more .pdf files.');
    return;
  }
  if (accepted.length < [...files].length) {
    showError(`${[...files].length - accepted.length} file(s) skipped — only PDFs are accepted.`);
  }
  for (const file of accepted) {
    if (items.length >= MAX_FILES) {
      showError(`Maximum ${MAX_FILES} files per session.`);
      break;
    }
    const item = { id: ++idSeq, file, status: 'queued', blob: null, error: null };
    items.push(item);
    renderCard(item);
  }
  updateView();
}

function updateView() {
  const has = items.length > 0;
  wfList.classList.toggle('hidden', !has);
  processBtn.classList.toggle('hidden', !has);
  updateFileCount();
  if (!has) zipBtn.classList.add('hidden');
  const previewWrap = document.getElementById('preview-wrap');
  previewWrap.classList.toggle('hidden', items.length !== 1);
  if (items.length === 1) {
    updatePreviewDoc();
  } else if (previewPdfJsDoc) {
    previewPdfJsDoc.destroy();
    previewPdfJsDoc = null;
  }
}

// ── Process queue ───────────────────────────────────────────────────────────
let running = false;

async function runQueue() {
  if (running) return;
  if (opts.type === 'text' && !opts.text.trim()) {
    showError('Enter watermark text first.');
    return;
  }
  if (opts.type === 'image' && !opts.wmBitmap) {
    showError('Drop a watermark image first.');
    return;
  }
  running = true;
  processBtn.disabled = true;
  hideError();

  for (const item of items) {
    item.status = 'working';
    item.error = null;
    updateCard(item);
    statusEl.textContent = `Processing ${item.file.name}…`;
    try {
      item.blob = await applyWatermark(item.file);
      item.status = 'done';
    } catch (err) {
      item.status = 'error';
      item.error = err.message || String(err);
    }
    updateCard(item);
  }

  running = false;
  processBtn.disabled = false;
  statusEl.textContent = '';

  const anyDone = items.some((it) => it.status === 'done');
  if (anyDone) zipBtn.classList.remove('hidden');
}

// ── Downloads ───────────────────────────────────────────────────────────────
function downloadOne(item) {
  if (!item.blob) return;
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.file.name.replace(/\.pdf$/i, '') + '-watermarked.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadZip() {
  const done = items.filter((it) => it.status === 'done' && it.blob);
  if (done.length === 0) return;
  if (done.length === 1) {
    downloadOne(done[0]);
    return;
  }
  zipBtn.disabled = true;
  statusEl.textContent = 'Building zip…';
  try {
    const entries = done.map((it) => ({
      name: it.file.name.replace(/\.pdf$/i, '') + '-watermarked.pdf',
      blob: it.blob,
    }));
    const zipBlob = await buildStoreZip(entries);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'watermarked-pdfs.zip';
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    zipBtn.disabled = false;
    statusEl.textContent = '';
  }
}

// ── Drop zone wiring ────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) ingestFiles(fileInput.files);
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
  if (e.dataTransfer.files.length) ingestFiles(e.dataTransfer.files);
});

// ── Watermark image drop zone ───────────────────────────────────────────────
wmImgDrop.addEventListener('click', () => wmImgInput.click());
wmImgDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    wmImgInput.click();
  }
});
wmImgInput.addEventListener('change', () => {
  if (wmImgInput.files?.[0]) loadWmImage(wmImgInput.files[0]);
  wmImgInput.value = '';
});
wmImgDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  wmImgDrop.classList.add('dragover');
});
wmImgDrop.addEventListener('dragleave', () => wmImgDrop.classList.remove('dragover'));
wmImgDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  wmImgDrop.classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith('image/')) loadWmImage(f);
});

async function loadWmImage(file) {
  try {
    opts.wmBitmap?.close?.();
    opts.wmBitmap = await createImageBitmap(file);
    const url = URL.createObjectURL(file);
    wmImgThumb.src = url;
    wmImgName.textContent = file.name;
    wmImgEmpty.classList.add('hidden');
    wmImgLoaded.classList.remove('hidden');
    schedulePreview();
  } catch (err) {
    showError('Could not load watermark image: ' + (err.message || String(err)));
  }
}

// ── Type pills ──────────────────────────────────────────────────────────────
document.querySelectorAll('[data-wm-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    opts.type = btn.dataset.wmType;
    document.querySelectorAll('[data-wm-type]').forEach((b) => b.classList.toggle('on', b === btn));
    document.getElementById('text-panel').classList.toggle('on', opts.type === 'text');
    document.getElementById('img-panel').classList.toggle('on', opts.type === 'image');
    schedulePreview();
  });
});

// ── Text controls ───────────────────────────────────────────────────────────
document.getElementById('text-content').addEventListener('input', (e) => {
  opts.text = e.target.value;
  schedulePreview();
});
document.getElementById('font-select').addEventListener('change', (e) => {
  opts.fontFamily = e.target.value;
  schedulePreview();
});
document.getElementById('font-size').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v) && v > 0) {
    opts.fontSize = v;
    schedulePreview();
  }
});

textColorInput.addEventListener('input', () => {
  opts.color = textColorInput.value;
  textColorBtn.style.setProperty('--color-btn-c', opts.color);
  textColorHex.textContent = opts.color.slice(1).toUpperCase();
  schedulePreview();
});

textOpacity.addEventListener('input', () => {
  opts.opacity = parseFloat(textOpacity.value);
  textOpacityVal.textContent = Math.round(opts.opacity * 100) + '%';
  schedulePreview();
});

document.querySelectorAll('[data-rot]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = parseFloat(btn.dataset.rot);
    opts.angleDeg = v;
    rotCustomInput.value = v;
    document
      .querySelectorAll('[data-rot]')
      .forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.rot) === v));
    schedulePreview();
  });
});

rotCustomInput.addEventListener('input', () => {
  const v = parseFloat(rotCustomInput.value);
  if (!isNaN(v)) {
    opts.angleDeg = v;
    document
      .querySelectorAll('[data-rot]')
      .forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.rot) === v));
    schedulePreview();
  }
});

// ── Image controls ──────────────────────────────────────────────────────────
imageOpacity.addEventListener('input', () => {
  opts.imageOpacity = parseFloat(imageOpacity.value);
  imageOpacityVal.textContent = Math.round(opts.imageOpacity * 100) + '%';
  schedulePreview();
});

imgScaleInput.addEventListener('input', () => {
  const v = parseInt(imgScaleInput.value, 10);
  if (!isNaN(v) && v > 0) {
    opts.imageScale = v;
    schedulePreview();
  }
});

// ── Position grid ───────────────────────────────────────────────────────────
document.querySelectorAll('.pos-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    opts.position = btn.dataset.pos;
    document.querySelectorAll('.pos-btn').forEach((b) => b.classList.toggle('on', b === btn));
    schedulePreview();
  });
});

marginInput.addEventListener('input', () => {
  const v = parseFloat(marginInput.value);
  if (!isNaN(v) && v >= 0) {
    opts.margin = v;
    schedulePreview();
  }
});

// ── Tile toggle ─────────────────────────────────────────────────────────────
tileToggle.addEventListener('change', () => {
  opts.tile = tileToggle.checked;
  densitySection.classList.toggle('hidden', !opts.tile);
  schedulePreview();
});

document.querySelectorAll('[data-density]').forEach((btn) => {
  btn.addEventListener('click', () => {
    opts.density = btn.dataset.density;
    document.querySelectorAll('[data-density]').forEach((b) => b.classList.toggle('on', b === btn));
    schedulePreview();
  });
});

// ── Pages input ─────────────────────────────────────────────────────────────
pagesInput.addEventListener('input', () => {
  opts.pages = pagesInput.value;
});

// ── Action buttons ──────────────────────────────────────────────────────────
processBtn.addEventListener('click', runQueue);

zipBtn.addEventListener('click', downloadZip);

document.getElementById('wf-clear-btn').addEventListener('click', () => {
  items = [];
  wfList.innerHTML = '';
  statusEl.textContent = '';
  hideError();
  zipBtn.classList.add('hidden');
  updateView();
});

wfList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  const idNum = parseInt(id, 10);
  const item = items.find((it) => it.id === idNum);
  if (!item) return;
  if (action === 'download') downloadOne(item);
  else if (action === 'remove') {
    items = items.filter((it) => it.id !== idNum);
    document.getElementById(`wf-${id}`)?.remove();
    updateView();
  }
});

updateView();
