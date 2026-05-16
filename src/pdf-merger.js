import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFArray,
  PDFDict,
  PDFNull,
  PDFNumber,
} from 'pdf-lib';

// ── State ──────────────────────────────────────────────────────────────────
let items = []; // { id, file, type:'pdf'|'image', pageCount, pagesInput }
let idSeq = 0;
let dragSrcId = null;

// ── DOM refs ──────────────────────────────────────────────────────────────
const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const stripWrap   = document.getElementById('strip-wrap');
const fileStrip   = document.getElementById('file-strip');
const fileCount   = document.getElementById('file-count');
const optWrap     = document.getElementById('options-wrap');
const actionWrap  = document.getElementById('action-wrap');
const mergeBtn    = document.getElementById('merge-btn');
const mergeStatus = document.getElementById('merge-status');
const errorBar    = document.getElementById('error-bar');
const outName     = document.getElementById('out-name');
const toggleBkm   = document.getElementById('toggle-bookmarks');
const toggleMeta  = document.getElementById('toggle-strip-meta');
const clearAllBtn = document.getElementById('clear-all-btn');

// ── Helpers ────────────────────────────────────────────────────────────────
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

function updateVisibility() {
  const hasFiles = items.length > 0;
  stripWrap.classList.toggle('hidden', !hasFiles);
  optWrap.classList.toggle('hidden', !hasFiles);
  actionWrap.classList.toggle('hidden', !hasFiles);
  fileCount.textContent = items.length ? `(${items.length})` : '';
}

// ── Page range parser ──────────────────────────────────────────────────────
// Returns a sorted array of 0-based page indices, or null for "all pages".
function parsePageRange(str, maxPage) {
  str = str.trim();
  if (!str) return null;

  const indices = new Set();
  const parts = str.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n < 1 || n > maxPage) throw new Error(`Page ${n} out of range (1–${maxPage})`);
      indices.add(n - 1);
    } else if (/^(\d+)-(\d*)$/.test(part)) {
      const [, a, b] = part.match(/^(\d+)-(\d*)$/);
      const from = parseInt(a, 10);
      const to   = b ? parseInt(b, 10) : maxPage;
      if (from < 1 || from > maxPage) throw new Error(`Page ${from} out of range (1–${maxPage})`);
      if (to < from || to > maxPage)  throw new Error(`Range "${part}" is invalid (max page: ${maxPage})`);
      for (let i = from; i <= to; i++) indices.add(i - 1);
    } else {
      throw new Error(`Cannot parse "${part}" — use e.g. "1-3, 7, 9-"`);
    }
  }

  return [...indices].sort((a, b) => a - b);
}

function validatePageRange(str, maxPage) {
  try { parsePageRange(str, maxPage); return ''; }
  catch (e) { return e.message; }
}

// ── Page count via pdf-lib ─────────────────────────────────────────────────
async function getPdfPageCount(file) {
  const buf = await file.arrayBuffer();
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}

// ── Image thumbnail via canvas ─────────────────────────────────────────────
function renderImageThumb(file, cardId) {
  const url = URL.createObjectURL(file);
  const thumbEl = document.querySelector(`#card-${cardId} .pdf-thumb`);
  if (!thumbEl) return;
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Image preview';
  img.onload = () => URL.revokeObjectURL(url);
  thumbEl.innerHTML = '';
  thumbEl.appendChild(img);
}

// ── Card rendering ─────────────────────────────────────────────────────────
function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'pdf-card';
  card.id = `card-${item.id}`;
  card.setAttribute('draggable', 'true');
  card.dataset.id = String(item.id);

  const pageLabel = item.pageCount
    ? `${item.pageCount} page${item.pageCount !== 1 ? 's' : ''} · `
    : '';

  card.innerHTML = `
    <button class="pdf-card-remove" aria-label="Remove ${item.file.name}">×</button>
    <div class="pdf-card-handle" aria-hidden="true">⠿</div>
    <div class="pdf-thumb">${item.type === 'pdf' ? '📄' : '🖼️'}</div>
    <div class="pdf-card-name" title="${item.file.name}">${item.file.name}</div>
    <div class="pdf-card-meta">${pageLabel}${formatBytes(item.file.size)}</div>
    <div class="pdf-card-pages-label">Pages (e.g. 1-3, 7, 9-)</div>
    <input type="text" class="pdf-card-pages-input" placeholder="all"
           aria-label="Page range for ${item.file.name}">
  `;

  // Drag to reorder
  card.addEventListener('dragstart', e => {
    dragSrcId = item.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.pdf-card').forEach(c => c.classList.remove('drag-over'));
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
    reRenderStrip();
  });

  // Remove
  card.querySelector('.pdf-card-remove').addEventListener('click', () => {
    items = items.filter(i => i.id !== item.id);
    reRenderStrip();
    updateVisibility();
  });

  // Page range validation
  const pagesInput = card.querySelector('.pdf-card-pages-input');
  pagesInput.value = item.pagesInput || '';
  pagesInput.addEventListener('input', () => {
    item.pagesInput = pagesInput.value;
    if (item.pageCount) {
      const err = validatePageRange(pagesInput.value, item.pageCount);
      pagesInput.classList.toggle('invalid', !!err);
      pagesInput.title = err;
    }
  });

  return card;
}

function reRenderStrip() {
  fileStrip.innerHTML = '';
  items.forEach(item => {
    fileStrip.appendChild(renderCard(item));
    if (item.type === 'image') renderImageThumb(item.file, item.id);
  });
  fileCount.textContent = items.length ? `(${items.length})` : '';
}

// Update just the meta line on a card after async page-count resolves.
function updateCardMeta(item) {
  const metaEl = document.querySelector(`#card-${item.id} .pdf-card-meta`);
  if (metaEl) {
    metaEl.textContent = `${item.pageCount} page${item.pageCount !== 1 ? 's' : ''} · ${formatBytes(item.file.size)}`;
  }
}

// ── File ingestion ─────────────────────────────────────────────────────────
async function ingestFiles(files) {
  const accepted = [...files].filter(f => {
    const name = f.name.toLowerCase();
    return (
      f.type === 'application/pdf' || name.endsWith('.pdf') ||
      f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/webp'
    );
  });

  if (accepted.length === 0) {
    showError('No supported files. Drop PDF, PNG, JPEG, or WebP files.');
    return;
  }
  if (accepted.length < files.length) {
    showError(`${files.length - accepted.length} file(s) skipped — only PDF, PNG, JPEG, and WebP are accepted.`);
  }

  for (const file of accepted) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const type  = isPdf ? 'pdf' : 'image';
    const id    = ++idSeq;
    const item  = { id, file, type, pageCount: type === 'image' ? 1 : 0, pagesInput: '' };
    items.push(item);
    fileStrip.appendChild(renderCard(item));

    if (type === 'image') {
      renderImageThumb(file, id);
    } else {
      // Resolve page count asynchronously so the card appears immediately.
      getPdfPageCount(file)
        .then(count => {
          item.pageCount = count;
          updateCardMeta(item);
          // Re-validate any page range the user may have typed while waiting.
          const input = document.querySelector(`#card-${id} .pdf-card-pages-input`);
          if (input && input.value) {
            const err = validatePageRange(input.value, count);
            input.classList.toggle('invalid', !!err);
            input.title = err;
          }
        })
        .catch(() => {});
    }
  }

  updateVisibility();
}

// ── Merge ──────────────────────────────────────────────────────────────────
async function merge() {
  if (items.length === 0) return;

  mergeBtn.disabled = true;
  mergeStatus.textContent = 'Merging…';
  errorBar.classList.add('hidden');

  try {
    const out = await PDFDocument.create();
    const addBookmarks = toggleBkm.checked;
    const stripMeta    = toggleMeta.checked;
    const outlineEntries = []; // { title, pageIndex }
    let totalPages = 0;

    for (const item of items) {
      mergeStatus.textContent = `Processing "${item.file.name}"…`;
      const firstPage = totalPages;

      if (item.type === 'pdf') {
        const buf      = await item.file.arrayBuffer();
        const src      = await PDFDocument.load(buf, { ignoreEncryption: true });
        const srcCount = src.getPageCount();
        const maxPage  = item.pageCount || srcCount;

        let indices;
        try {
          indices = parsePageRange(item.pagesInput, maxPage);
        } catch (e) {
          throw new Error(`"${item.file.name}": ${e.message}`);
        }
        if (indices === null) indices = Array.from({ length: srcCount }, (_, i) => i);

        const copied = await out.copyPages(src, indices);
        copied.forEach(p => out.addPage(p));
        totalPages += copied.length;

      } else {
        // Image → A4 PDF page
        const buf  = await item.file.arrayBuffer();
        let embedded;
        if (item.file.type === 'image/png') {
          embedded = await out.embedPng(buf);
        } else if (item.file.type === 'image/webp') {
          embedded = await out.embedPng(await webpToPngBuffer(item.file));
        } else {
          embedded = await out.embedJpg(buf);
        }

        const A4_W = 595, A4_H = 842;
        const scale = Math.min(A4_W / embedded.width, A4_H / embedded.height);
        const imgW  = embedded.width  * scale;
        const imgH  = embedded.height * scale;
        const page  = out.addPage([A4_W, A4_H]);
        page.drawImage(embedded, {
          x:      (A4_W - imgW) / 2,
          y:      (A4_H - imgH) / 2,
          width:  imgW,
          height: imgH,
        });
        totalPages += 1;
      }

      if (addBookmarks) {
        outlineEntries.push({ title: item.file.name, pageIndex: firstPage });
      }
    }

    if (addBookmarks && outlineEntries.length > 0) {
      addOutline(out, outlineEntries);
    }

    if (stripMeta) {
      out.setTitle('');
      out.setAuthor('');
      out.setCreator('');
      out.setProducer('');
      out.setSubject('');
      out.setKeywords([]);
    }

    mergeStatus.textContent = 'Saving…';
    const bytes    = await out.save();
    const blob     = new Blob([bytes], { type: 'application/pdf' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = outName.value.trim() || 'merged.pdf';
    a.click();
    URL.revokeObjectURL(url);
    mergeStatus.textContent = `Done — ${formatBytes(bytes.length)}`;
  } catch (err) {
    showError(err.message || String(err));
    mergeStatus.textContent = '';
    console.error(err);
  } finally {
    mergeBtn.disabled = false;
  }
}

// ── Outline (bookmarks) builder ────────────────────────────────────────────
// pdf-lib 1.x has no public outline API; we write the PDF object graph
// directly. Best-effort: if it fails the merge still completes.
function addOutline(doc, entries) {
  try {
    const context = doc.context;
    const pages   = doc.getPages();

    const itemRefs = entries
      .map(e => {
        const page = pages[e.pageIndex];
        return page ? { ref: context.nextRef(), title: e.title, page } : null;
      })
      .filter(Boolean);

    if (itemRefs.length === 0) return;

    const outlinesRef = context.nextRef();

    itemRefs.forEach((item, idx) => {
      const dest = PDFArray.withContext(context);
      dest.push(item.page.ref);
      dest.push(PDFName.of('XYZ'));
      dest.push(PDFNull);
      dest.push(PDFNull);
      dest.push(PDFNull);

      const dict = PDFDict.withContext(context);
      dict.set(PDFName.of('Title'),  PDFString.of(item.title));
      dict.set(PDFName.of('Parent'), outlinesRef);
      dict.set(PDFName.of('Dest'),   dest);
      if (idx > 0)                   dict.set(PDFName.of('Prev'), itemRefs[idx - 1].ref);
      if (idx < itemRefs.length - 1) dict.set(PDFName.of('Next'), itemRefs[idx + 1].ref);
      context.assign(item.ref, dict);
    });

    const outlinesDict = PDFDict.withContext(context);
    outlinesDict.set(PDFName.of('Type'),  PDFName.of('Outlines'));
    outlinesDict.set(PDFName.of('First'), itemRefs[0].ref);
    outlinesDict.set(PDFName.of('Last'),  itemRefs[itemRefs.length - 1].ref);
    outlinesDict.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));
    context.assign(outlinesRef, outlinesDict);

    doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  } catch (e) {
    console.warn('Outline build failed (merge will still succeed):', e);
  }
}

// ── WebP → PNG via canvas (pdf-lib accepts only PNG and JPEG) ─────────────
function webpToPngBuffer(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('WebP → PNG conversion failed')); return; }
        blob.arrayBuffer().then(resolve).catch(reject);
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
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
  if (e.dataTransfer.files.length) ingestFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) ingestFiles(fileInput.files);
  fileInput.value = '';
});

clearAllBtn.addEventListener('click', () => {
  items = [];
  fileStrip.innerHTML = '';
  updateVisibility();
});

mergeBtn.addEventListener('click', merge);
