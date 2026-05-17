import { PDFDocument, rgb } from 'pdf-lib';

// 1 in = 72 pt, 1 mm = 2.834645669 pt
const MM_TO_PT = 2.834645669;
const IN_TO_PT = 72;

const PAGE_SIZES = {
  a4:     { w: 595, h: 842 },
  letter: { w: 612, h: 792 },
  legal:  { w: 612, h: 1008 },
};

// ── State ────────────────────────────────────────────────────────────────
let items = []; // { id, file, type:'png'|'jpeg'|'webp', natW, natH, objectUrl }
let idSeq = 0;
let dragSrcId = null;

const opts = {
  pageSize: 'auto',     // 'auto' | 'a4' | 'letter' | 'legal' | 'custom'
  customW: 800,
  customH: 1200,
  customUnit: 'pt',     // 'pt' | 'mm' | 'in'
  orientation: 'auto',  // 'auto' | 'portrait' | 'landscape'
  fit: 'contain',       // 'contain' | 'cover' | 'stretch'
  marginMm: 0,
  customMarginMm: 5,
  background: 'white',  // 'white' | 'transparent'
};

// ── DOM refs ─────────────────────────────────────────────────────────────
const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const gridWrap   = document.getElementById('grid-wrap');
const grid       = document.getElementById('image-grid');
const fileCount  = document.getElementById('file-count');
const optsWrap   = document.getElementById('options-wrap');
const actionWrap = document.getElementById('action-wrap');
const buildBtn   = document.getElementById('build-btn');
const buildStat  = document.getElementById('build-status');
const errorBar   = document.getElementById('error-bar');
const warnBar    = document.getElementById('warn-bar');
const outName    = document.getElementById('out-name');
const clearAll   = document.getElementById('clear-all-btn');
const customSizeWrap   = document.getElementById('custom-size-wrap');
const customMarginWrap = document.getElementById('custom-margin-wrap');
const customW   = document.getElementById('custom-w');
const customH   = document.getElementById('custom-h');
const customU   = document.getElementById('custom-unit');
const customM   = document.getElementById('custom-margin');

// Initial filename — images_YYYYMMDD.pdf so repeated runs don't overwrite.
function todayStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
outName.value = `images_${todayStamp()}.pdf`;

// ── Helpers ──────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 6000);
}

function setWarn(msg) {
  if (!msg) { warnBar.classList.add('hidden'); warnBar.textContent = ''; return; }
  warnBar.textContent = msg;
  warnBar.classList.remove('hidden');
}

function updateVisibility() {
  const has = items.length > 0;
  gridWrap.classList.toggle('hidden', !has);
  optsWrap.classList.toggle('hidden', !has);
  actionWrap.classList.toggle('hidden', !has);
  fileCount.textContent = has ? `(${items.length})` : '';
}

function detectType(file) {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/png')  return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg';
  if (mime === 'image/webp') return 'webp';
  return null;
}

function readNaturalSize(objectUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = objectUrl;
  });
}

// ── Card rendering ───────────────────────────────────────────────────────
function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'img-card';
  card.id = `imgcard-${item.id}`;
  card.setAttribute('draggable', 'true');
  card.dataset.id = String(item.id);

  card.innerHTML = `
    <button class="img-card-remove" aria-label="Remove ${item.file.name}" type="button">×</button>
    <div class="img-card-handle" aria-hidden="true">⠿</div>
    <div class="img-thumb"><img alt="" src="${item.objectUrl}"></div>
    <div class="img-card-name" title="${item.file.name}">${item.file.name}</div>
    <div class="img-card-meta">${item.natW || '?'}×${item.natH || '?'} · ${formatBytes(item.file.size)}</div>
  `;

  card.addEventListener('dragstart', e => {
    dragSrcId = item.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.img-card').forEach(c => c.classList.remove('drag-over'));
  });
  card.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSrcId !== item.id) card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => {
    e.preventDefault();
    card.classList.remove('drag-over');
    if (dragSrcId == null || dragSrcId === item.id) return;
    const srcIdx = items.findIndex(i => i.id === dragSrcId);
    const dstIdx = items.findIndex(i => i.id === item.id);
    if (srcIdx < 0 || dstIdx < 0) return;
    const [moved] = items.splice(srcIdx, 1);
    items.splice(dstIdx, 0, moved);
    reRenderGrid();
  });

  card.querySelector('.img-card-remove').addEventListener('click', () => {
    URL.revokeObjectURL(item.objectUrl);
    items = items.filter(i => i.id !== item.id);
    reRenderGrid();
    updateVisibility();
  });

  return card;
}

function reRenderGrid() {
  grid.innerHTML = '';
  items.forEach(i => grid.appendChild(renderCard(i)));
  fileCount.textContent = items.length ? `(${items.length})` : '';
}

// ── File ingestion ───────────────────────────────────────────────────────
async function ingestFiles(files) {
  const accepted = [...files].filter(f => detectType(f) != null);
  if (accepted.length === 0) {
    showError('No supported files. Drop PNG, JPEG, or WebP images.');
    return;
  }
  if (accepted.length < files.length) {
    showError(`${files.length - accepted.length} file(s) skipped — only PNG, JPEG, and WebP are accepted.`);
  }
  for (const file of accepted) {
    const type = detectType(file);
    const id   = ++idSeq;
    const objectUrl = URL.createObjectURL(file);
    const { w, h } = await readNaturalSize(objectUrl);
    const item = { id, file, type, natW: w, natH: h, objectUrl };
    items.push(item);
    grid.appendChild(renderCard(item));
  }
  updateVisibility();
}

// ── Options wiring ───────────────────────────────────────────────────────
function bindRadioPills(group, key, onChange) {
  group.forEach(btn => {
    btn.addEventListener('click', () => {
      group.forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      opts[key] = btn.dataset[Object.keys(btn.dataset)[0]];
      onChange?.();
    });
  });
}

function pillsByAttr(attr) {
  return Array.from(document.querySelectorAll(`[data-${attr}]`));
}

const pageBtns    = pillsByAttr('page');
const orientBtns  = pillsByAttr('orient');
const fitBtns     = pillsByAttr('fit');
const marginBtns  = pillsByAttr('margin');
const bgBtns      = pillsByAttr('bg');

pageBtns.forEach(b => b.addEventListener('click', () => {
  pageBtns.forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  opts.pageSize = b.dataset.page;
  customSizeWrap.classList.toggle('on', opts.pageSize === 'custom');
}));
orientBtns.forEach(b => b.addEventListener('click', () => {
  orientBtns.forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  opts.orientation = b.dataset.orient;
}));
fitBtns.forEach(b => b.addEventListener('click', () => {
  fitBtns.forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  opts.fit = b.dataset.fit;
}));
marginBtns.forEach(b => b.addEventListener('click', () => {
  marginBtns.forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const v = b.dataset.margin;
  if (v === 'custom') {
    customMarginWrap.classList.add('on');
    opts.marginMm = opts.customMarginMm;
  } else {
    customMarginWrap.classList.remove('on');
    opts.marginMm = parseFloat(v);
  }
}));
bgBtns.forEach(b => b.addEventListener('click', () => {
  bgBtns.forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  opts.background = b.dataset.bg;
  setWarn(opts.background === 'transparent'
    ? 'Most PDF viewers render transparent page backgrounds as black. Pick White if your images have transparent regions.'
    : '');
}));

customW.addEventListener('input', () => { opts.customW = parseFloat(customW.value) || 800; });
customH.addEventListener('input', () => { opts.customH = parseFloat(customH.value) || 1200; });
customU.addEventListener('change', () => { opts.customUnit = customU.value; });
customM.addEventListener('input', () => {
  opts.customMarginMm = parseFloat(customM.value) || 0;
  if (document.querySelector('[data-margin="custom"]').classList.contains('on')) {
    opts.marginMm = opts.customMarginMm;
  }
});

// ── Geometry ─────────────────────────────────────────────────────────────
function customToPt() {
  const v = (a) => opts.customUnit === 'mm' ? a * MM_TO_PT
            : opts.customUnit === 'in' ? a * IN_TO_PT : a;
  return { w: v(opts.customW), h: v(opts.customH) };
}

// Returns { w, h } in PDF points for a given image.
function pageDims(item) {
  if (opts.pageSize === 'auto') {
    // Image at 72 DPI: 1 px == 1 pt.
    return { w: Math.max(1, item.natW || 595), h: Math.max(1, item.natH || 842) };
  }
  let base;
  if (opts.pageSize === 'custom') base = customToPt();
  else base = PAGE_SIZES[opts.pageSize] || PAGE_SIZES.a4;
  let { w, h } = base;
  if (opts.orientation === 'landscape' && w < h) [w, h] = [h, w];
  else if (opts.orientation === 'portrait' && w > h) [w, h] = [h, w];
  else if (opts.orientation === 'auto' && item.natW && item.natH) {
    const imgLandscape = item.natW > item.natH;
    const pageLandscape = w > h;
    if (imgLandscape !== pageLandscape) [w, h] = [h, w];
  }
  return { w, h };
}

function fitRect(pageW, pageH, imgW, imgH) {
  const m = opts.marginMm * MM_TO_PT;
  const innerW = Math.max(1, pageW - 2 * m);
  const innerH = Math.max(1, pageH - 2 * m);

  if (opts.pageSize === 'auto') {
    return { x: 0, y: 0, w: pageW, h: pageH, clip: false };
  }
  if (opts.fit === 'stretch') {
    return { x: m, y: m, w: innerW, h: innerH, clip: false };
  }
  const sFit = Math.min(innerW / imgW, innerH / imgH);
  const sCover = Math.max(innerW / imgW, innerH / imgH);
  const s = opts.fit === 'cover' ? sCover : sFit;
  const w = imgW * s;
  const h = imgH * s;
  const x = m + (innerW - w) / 2;
  const y = m + (innerH - h) / 2;
  return { x, y, w, h, clip: opts.fit === 'cover' };
}

// ── WebP → PNG buffer (pdf-lib only accepts PNG + JPEG) ──────────────────
function webpToPng(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? b.arrayBuffer().then(resolve) : reject(new Error('WebP decode failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

// ── Build ────────────────────────────────────────────────────────────────
async function build() {
  if (items.length === 0) return;
  buildBtn.disabled = true;
  errorBar.classList.add('hidden');
  buildStat.textContent = 'Building…';

  try {
    const doc = await PDFDocument.create();
    let webpCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      buildStat.textContent = `Embedding ${i + 1} / ${items.length} — ${item.file.name}`;

      let embedded;
      if (item.type === 'png') {
        embedded = await doc.embedPng(await item.file.arrayBuffer());
      } else if (item.type === 'jpeg') {
        embedded = await doc.embedJpg(await item.file.arrayBuffer());
      } else {
        // webp → re-encode to PNG, then embed (PNG keeps any alpha)
        embedded = await doc.embedPng(await webpToPng(item.file));
        webpCount++;
      }

      const { w: pageW, h: pageH } = pageDims(item);
      const rect = fitRect(pageW, pageH, embedded.width, embedded.height);
      const page = doc.addPage([pageW, pageH]);

      if (opts.background === 'white') {
        page.drawRectangle({
          x: 0, y: 0, width: pageW, height: pageH,
          color: rgb(1, 1, 1),
        });
      }

      // For cover we let drawImage overflow but clip via the page boundary —
      // PDF viewers automatically clip drawing to the page rectangle, so no
      // explicit clip path is needed.
      page.drawImage(embedded, {
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
      });
    }

    buildStat.textContent = 'Saving…';
    const bytes = await doc.save();
    const blob  = new Blob([bytes], { type: 'application/pdf' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = (outName.value.trim() || 'images.pdf').replace(/\.pdf$/i, '') + '.pdf';
    a.click();
    URL.revokeObjectURL(url);

    const extra = webpCount > 0 ? ` — ${webpCount} WebP re-encoded to PNG` : '';
    buildStat.textContent = `Done — ${formatBytes(bytes.length)}${extra}`;
  } catch (err) {
    showError(err.message || String(err));
    buildStat.textContent = '';
    console.error(err);
  } finally {
    buildBtn.disabled = false;
  }
}

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
  items.forEach(i => URL.revokeObjectURL(i.objectUrl));
  items = [];
  grid.innerHTML = '';
  updateVisibility();
  buildStat.textContent = '';
});

buildBtn.addEventListener('click', build);
