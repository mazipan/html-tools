import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib';

// formatBytes / formatPct / buildStoreZip are loaded as classic-script globals
// from image-utils.js (see <script src="image-utils.js"> in the HTML head).
const { formatBytes, formatPct, buildStoreZip } = window;

const MAX_FILES = 25;

const PRESET_QUALITY = {
  lossless: 0.92,
  visual:   0.85,
  smaller:  0.70,
  smallest: 0.50,
};

// ── State ────────────────────────────────────────────────────────────────
let items = []; // { id, file, status, originalBytes, compressedBlob?, stats? }
let idSeq = 0;

const opts = {
  preset: 'visual',
  downscale: false,
  downscalePx: 2000,
  stripMeta: true,
  filenamePattern: 'overwrite', // 'overwrite' | 'suffix'
};

// ── DOM refs ─────────────────────────────────────────────────────────────
const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const stripWrap  = document.getElementById('strip-wrap');
const fileStrip  = document.getElementById('file-strip');
const fileCount  = document.getElementById('file-count');
const optsWrap   = document.getElementById('options-wrap');
const actionWrap = document.getElementById('action-wrap');
const compressBtn  = document.getElementById('compress-btn');
const downloadZipBtn = document.getElementById('download-zip-btn');
const statusEl   = document.getElementById('compress-status');
const errorBar   = document.getElementById('error-bar');
const clearAll   = document.getElementById('clear-all-btn');
const toggleDown = document.getElementById('toggle-downscale');
const downInput  = document.getElementById('downscale-input');
const downPx     = document.getElementById('downscale-px');
const toggleMeta = document.getElementById('toggle-strip-meta');
const filePattern = document.getElementById('filename-pattern');
const summaryWrap = document.getElementById('compress-summary');
const summaryRows = document.getElementById('summary-rows');
const summaryTotal = document.getElementById('summary-total');

// ── Helpers ──────────────────────────────────────────────────────────────
function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 6000);
}

function updateVisibility() {
  const has = items.length > 0;
  stripWrap.classList.toggle('hidden', !has);
  optsWrap.classList.toggle('hidden', !has);
  actionWrap.classList.toggle('hidden', !has);
  fileCount.textContent = has ? `(${items.length})` : '';
  compressBtn.textContent = items.length === 1 ? '🗜️ Compress' : '🗜️ Compress all';
}

function outFilename(srcName) {
  const stem = srcName.replace(/\.pdf$/i, '');
  return opts.filenamePattern === 'suffix' ? `${stem}-compressed.pdf` : `${stem}.pdf`;
}

// ── Card rendering ───────────────────────────────────────────────────────
function statusLabel(item) {
  switch (item.status) {
    case 'queued':  return 'Queued';
    case 'working': return item.statusDetail || 'Compressing…';
    case 'done':    return `Done — ${item.stats?.imagesReplaced ?? 0} image(s) re-encoded${item.stats?.imagesSkipped ? `, ${item.stats.imagesSkipped} skipped` : ''}`;
    case 'skipped': return 'No JPEG images found — file unchanged';
    case 'error':   return `Error — ${item.error || 'unknown'}`;
    default:        return '';
  }
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'pdfc-card';
  card.id = `pdfc-${item.id}`;

  card.innerHTML = `
    <button class="pdfc-card-remove" aria-label="Remove ${item.file.name}" type="button">×</button>
    <div class="pdfc-thumb" aria-hidden="true">📄</div>
    <div class="pdfc-name" title="${item.file.name}">${item.file.name}</div>
    <div class="pdfc-meta">${formatBytes(item.originalBytes)}</div>
    <div class="pdfc-status ${item.status}"><span class="dot" aria-hidden="true"></span><span class="label">${statusLabel(item)}</span></div>
    <div class="pdfc-result"></div>
    <div class="pdfc-actions"></div>
  `;

  card.querySelector('.pdfc-card-remove').addEventListener('click', () => {
    items = items.filter(i => i.id !== item.id);
    card.remove();
    fileCount.textContent = items.length ? `(${items.length})` : '';
    updateVisibility();
    refreshActionState();
    renderSummary();
  });

  return card;
}

function updateCard(item) {
  const card = document.getElementById(`pdfc-${item.id}`);
  if (!card) return;
  const status = card.querySelector('.pdfc-status');
  status.className = `pdfc-status ${item.status}`;
  status.querySelector('.label').textContent = statusLabel(item);

  const result = card.querySelector('.pdfc-result');
  result.innerHTML = '';
  if (item.status === 'done' && item.stats) {
    const before = item.stats.before;
    const after  = item.stats.after;
    const pctNum = before ? ((after - before) / before) * 100 : 0;
    const cls = pctNum < -2 ? 'good' : (pctNum > 2 ? 'bad' : 'neutral');
    result.innerHTML = `
      <span class="before">${formatBytes(before)}</span>
      <span>→</span>
      <span class="after">${formatBytes(after)}</span>
      <span class="delta ${cls}">${formatPct(after, before)}</span>
    `;
  }

  const actions = card.querySelector('.pdfc-actions');
  actions.innerHTML = '';
  if (item.status === 'done' && item.compressedBlob) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-secondary';
    btn.type = 'button';
    btn.textContent = '⬇️ Download';
    btn.addEventListener('click', () => downloadOne(item));
    actions.appendChild(btn);
  }
}

// ── Downloads ────────────────────────────────────────────────────────────
function downloadOne(item) {
  if (!item.compressedBlob) return;
  const url = URL.createObjectURL(item.compressedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outFilename(item.file.name);
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadZip() {
  const done = items.filter(i => i.status === 'done' && i.compressedBlob);
  if (done.length === 0) return;
  const entries = done.map(i => ({ name: outFilename(i.file.name), blob: i.compressedBlob }));
  const zip = await buildStoreZip(entries);
  const url = URL.createObjectURL(zip);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'compressed-pdfs.zip';
  a.click();
  URL.revokeObjectURL(url);
}

function refreshActionState() {
  const doneCount = items.filter(i => i.status === 'done').length;
  const inFlight = items.some(i => i.status === 'queued' || i.status === 'working');
  // Only surface the Download button once the queue has settled — otherwise
  // the label would flicker between "Download" and "Download all (zip)" as
  // each file finishes mid-run.
  if (doneCount === 0 || inFlight) {
    downloadZipBtn.classList.add('hidden');
    return;
  }
  downloadZipBtn.classList.remove('hidden');
  downloadZipBtn.textContent = doneCount === 1 ? '⬇️ Download' : '⬇️ Download all (zip)';
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSummary() {
  const processed = items.filter(i =>
    i.status === 'done' || i.status === 'skipped' || i.status === 'error'
  );
  if (processed.length === 0) {
    summaryWrap.classList.add('hidden');
    summaryRows.innerHTML = '';
    summaryTotal.textContent = '';
    return;
  }
  summaryWrap.classList.remove('hidden');

  let totalBefore = 0;
  let totalAfter  = 0;

  summaryRows.innerHTML = processed.map(i => {
    if (i.status === 'error') {
      return `<div class="summary-row">
        <span class="name" title="${escAttr(i.file.name)}">${escAttr(i.file.name)}</span>
        <span class="sizes">${formatBytes(i.originalBytes)}</span>
        <span class="delta error" title="${escAttr(i.error || '')}">error</span>
      </div>`;
    }
    if (i.status === 'skipped' || !i.stats) {
      // Treat the "no changes" path as zero savings on totals.
      totalBefore += i.originalBytes;
      totalAfter  += i.originalBytes;
      return `<div class="summary-row">
        <span class="name" title="${escAttr(i.file.name)}">${escAttr(i.file.name)}</span>
        <span class="sizes">${formatBytes(i.originalBytes)}</span>
        <span class="delta skipped" title="No JPEG images re-encoded (text-only or non-DCT images)">unchanged</span>
      </div>`;
    }
    const before = i.stats.before;
    const after  = i.stats.after;
    totalBefore += before;
    totalAfter  += after;
    const pctNum = before ? ((after - before) / before) * 100 : 0;
    const cls = pctNum < -2 ? 'good' : (pctNum > 2 ? 'bad' : 'neutral');
    return `<div class="summary-row">
      <span class="name" title="${escAttr(i.file.name)}">${escAttr(i.file.name)}</span>
      <span class="sizes">
        <span class="before">${formatBytes(before)}</span>
        <span class="arrow">→</span>
        <span class="after">${formatBytes(after)}</span>
      </span>
      <span class="delta ${cls}">${formatPct(after, before)}</span>
    </div>`;
  }).join('');

  const savedBytes = totalBefore - totalAfter;
  const savedPct = totalBefore ? (savedBytes / totalBefore) * 100 : 0;
  const sign = savedBytes > 0 ? '−' : (savedBytes < 0 ? '+' : '');
  summaryTotal.textContent =
    `${processed.length} file${processed.length === 1 ? '' : 's'} · saved ${sign}${formatBytes(Math.abs(savedBytes))} (${savedPct.toFixed(0)}%)`;
}

// ── File ingestion ───────────────────────────────────────────────────────
async function ingestFiles(files) {
  const accepted = [...files].filter(f =>
    f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  if (accepted.length === 0) {
    showError('No PDFs found. Drop one or more .pdf files.');
    return;
  }
  if (accepted.length < files.length) {
    showError(`${files.length - accepted.length} file(s) skipped — only PDFs are accepted.`);
  }
  if (items.length + accepted.length > MAX_FILES) {
    showError(`Cap is ${MAX_FILES} files per session. ${accepted.length} dropped, only adding what fits.`);
  }

  for (const file of accepted) {
    if (items.length >= MAX_FILES) break;
    const id = ++idSeq;
    const item = {
      id, file,
      status: 'queued',
      originalBytes: file.size,
      compressedBlob: null,
      stats: null,
      error: null,
    };
    items.push(item);
    fileStrip.appendChild(renderCard(item));
  }
  updateVisibility();
  refreshActionState();
}

// ── The image-XObject walk (Path A) ──────────────────────────────────────

// pdf-lib stores `Filter` as either a single PDFName or a PDFArray of them.
// Return the *last* filter name (the one applied closest to the raw bytes;
// i.e. the one to decode first when reading). For DCTDecode-only support we
// treat anything that *ends* with /DCTDecode as decodable.
function lastFilterName(filterEntry) {
  if (!filterEntry) return null;
  if (filterEntry instanceof PDFName) return filterEntry.decodeText();
  if (filterEntry instanceof PDFArray) {
    const items = filterEntry.asArray();
    const last = items[items.length - 1];
    if (last instanceof PDFName) return last.decodeText();
  }
  return null;
}

function colorSpaceName(csEntry) {
  if (csEntry instanceof PDFName) return csEntry.decodeText();
  if (csEntry instanceof PDFArray) {
    const first = csEntry.asArray()[0];
    if (first instanceof PDFName) return first.decodeText();
  }
  return null;
}

// Encode a Blob → JPEG Blob at a given quality, optionally downscaled so the
// longer edge fits within `maxLong` pixels.
async function reencodeJpeg(srcBlob, quality, maxLong) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(srcBlob);
  } catch (_) {
    return null; // unsupported colour space, broken, etc.
  }
  if (!bitmap || bitmap.width === 0 || bitmap.height === 0) {
    bitmap?.close?.();
    return null;
  }
  let dstW = bitmap.width;
  let dstH = bitmap.height;
  if (maxLong > 0 && Math.max(dstW, dstH) > maxLong) {
    const s = maxLong / Math.max(dstW, dstH);
    dstW = Math.max(1, Math.round(dstW * s));
    dstH = Math.max(1, Math.round(dstH * s));
  }
  const canvas = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(dstW, dstH)
    : Object.assign(document.createElement('canvas'), { width: dstW, height: dstH });
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha — fill white in case the decoded source carries any.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  bitmap.close?.();
  const blob = await (canvas.convertToBlob
    ? canvas.convertToBlob({ type: 'image/jpeg', quality })
    : new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)));
  return { blob, w: dstW, h: dstH };
}

async function compressPdf(file) {
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;

  let imagesReplaced = 0;
  let imagesSkipped  = 0;
  let bytesShavedFromImages = 0; // approximate; pre-save accounting

  // Track refs we've already replaced so we don't double-process a shared
  // image XObject referenced from multiple pages.
  const visited = new Set();

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (visited.has(ref)) continue;
    if (!(obj instanceof PDFRawStream)) continue;

    const dict = obj.dict;
    const subtype = dict.get(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || subtype.decodeText() !== 'Image') continue;

    const filter = dict.get(PDFName.of('Filter'));
    const filterName = lastFilterName(filter);
    if (filterName !== 'DCTDecode') {
      imagesSkipped++;
      continue;
    }

    // CMYK / DeviceN JPEG inside PDF — createImageBitmap support is hit-or-miss
    // across browsers. Skip rather than risk corrupting visual output.
    const cs = colorSpaceName(dict.get(PDFName.of('ColorSpace')));
    if (cs === 'DeviceCMYK' || cs === 'DeviceN') {
      imagesSkipped++;
      continue;
    }

    // Skip image masks — they're a different beast (1-bit, /Filter/CCITTFaxDecode
    // is the common path; even the rare DCT-encoded mask would lose the mask
    // semantics if we round-tripped it through a regular JPEG decode).
    const isMask = dict.get(PDFName.of('ImageMask'));
    if (isMask) { imagesSkipped++; continue; }
    if (dict.get(PDFName.of('SMaskInData'))) { imagesSkipped++; continue; }

    const srcBytes = obj.contents;
    const srcBlob = new Blob([srcBytes], { type: 'image/jpeg' });

    const maxLong = opts.downscale ? Math.max(200, opts.downscalePx | 0) : 0;
    const result = await reencodeJpeg(srcBlob, PRESET_QUALITY[opts.preset], maxLong);
    if (!result) { imagesSkipped++; continue; }

    const newBytes = new Uint8Array(await result.blob.arrayBuffer());
    if (newBytes.length >= srcBytes.length) {
      // Re-encoding made it bigger (already-aggressive source) — keep original.
      imagesSkipped++;
      continue;
    }

    // Build the replacement stream. Reuse the existing dict (mutated) so we
    // preserve ColorSpace, BitsPerComponent, Decode, SMask, etc.
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    dict.delete(PDFName.of('DecodeParms'));
    dict.set(PDFName.of('Width'),  PDFNumber.of(result.w));
    dict.set(PDFName.of('Height'), PDFNumber.of(result.h));
    // Length is auto-rewritten by pdf-lib on save based on the new bytes.

    const newStream = PDFRawStream.of(dict, newBytes);
    ctx.assign(ref, newStream);
    visited.add(ref);
    imagesReplaced++;
    bytesShavedFromImages += (srcBytes.length - newBytes.length);
  }

  if (opts.stripMeta) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
  }

  const outBytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([outBytes], { type: 'application/pdf' });

  return {
    blob,
    stats: {
      before: sourceBytes.length,
      after:  outBytes.length,
      imagesReplaced,
      imagesSkipped,
      bytesShavedFromImages,
    },
  };
}

// ── Queue runner ─────────────────────────────────────────────────────────
async function runQueue() {
  compressBtn.disabled = true;
  errorBar.classList.add('hidden');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.status === 'done' || item.status === 'error') continue;
    item.status = 'working';
    item.statusDetail = `Compressing ${i + 1} / ${items.length}…`;
    updateCard(item);
    statusEl.textContent = `Processing ${i + 1} / ${items.length} — ${item.file.name}`;
    try {
      const { blob, stats } = await compressPdf(item.file);
      item.compressedBlob = blob;
      item.stats = stats;
      // If we didn't replace anything *and* output isn't smaller, surface that
      // as "skipped" so the user knows it was a no-op.
      if (stats.imagesReplaced === 0 && stats.after >= stats.before * 0.999) {
        item.status = 'skipped';
      } else {
        item.status = 'done';
      }
    } catch (err) {
      console.error(err);
      item.status = 'error';
      item.error = err.message || String(err);
    }
    updateCard(item);
    refreshActionState();
    renderSummary();
  }
  compressBtn.disabled = false;
  statusEl.textContent = 'Done.';
  renderSummary();
}

// ── Options wiring ───────────────────────────────────────────────────────
const presetBtns = Array.from(document.querySelectorAll('[data-preset]'));
presetBtns.forEach(b => b.addEventListener('click', () => {
  presetBtns.forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  opts.preset = b.dataset.preset;
}));

toggleDown.addEventListener('change', () => {
  opts.downscale = toggleDown.checked;
  downInput.classList.toggle('on', toggleDown.checked);
});
downPx.addEventListener('input', () => {
  opts.downscalePx = parseInt(downPx.value, 10) || 2000;
});
toggleMeta.addEventListener('change', () => { opts.stripMeta = toggleMeta.checked; });
filePattern.addEventListener('change', () => { opts.filenamePattern = filePattern.value; });

// ── Event wiring ─────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) ingestFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) ingestFiles(fileInput.files);
  fileInput.value = '';
});

clearAll.addEventListener('click', () => {
  items = [];
  fileStrip.innerHTML = '';
  statusEl.textContent = '';
  updateVisibility();
  refreshActionState();
  renderSummary();
});

compressBtn.addEventListener('click', runQueue);
downloadZipBtn.addEventListener('click', () => {
  const done = items.filter(i => i.status === 'done' && i.compressedBlob);
  if (done.length === 0) return;
  if (done.length === 1) downloadOne(done[0]);
  else downloadZip();
});
