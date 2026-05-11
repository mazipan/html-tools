// Probe whether the browser can encode a given image MIME type by attempting
// to round-trip a 1x1 canvas through toDataURL. Browsers that don't support
// the requested type silently fall back to PNG, which we detect by prefix.
function supportsMime(mime) {
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    return c.toDataURL(mime).indexOf(`data:${mime}`) === 0;
  } catch (_) {
    return false;
  }
}

function formatBytes(n) {
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatPct(after, before) {
  if (!before) return '0%';
  const delta = ((after - before) / before) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(0)}%`;
}

// Compute the output (W, H) for an input given a resize spec. Modes:
//   'max'     — fit inside maxW × maxH (default; converter uses this)
//   'exact'   — return targetW × targetH unconditionally
//   'percent' — scale by opts.scale (a percent, e.g. 50 = half)
// `noUpscale` defaults to true on max/percent; ignored in exact mode.
// Returns the input size unchanged when resize is off or no constraint applies.
function computeTargetSize(srcW, srcH, opts) {
  if (!opts || !opts.enabled) return { w: srcW, h: srcH };
  const mode = opts.mode || 'max';

  if (mode === 'exact') {
    return {
      w: Math.max(1, Math.round(opts.targetW || srcW)),
      h: Math.max(1, Math.round(opts.targetH || srcH)),
    };
  }

  if (mode === 'percent') {
    let s = (opts.scale || 100) / 100;
    if (opts.noUpscale !== false) s = Math.min(s, 1);
    return {
      w: Math.max(1, Math.round(srcW * s)),
      h: Math.max(1, Math.round(srcH * s)),
    };
  }

  // 'max'
  const maxW = opts.maxW > 0 ? opts.maxW : Infinity;
  const maxH = opts.maxH > 0 ? opts.maxH : Infinity;
  if (!isFinite(maxW) && !isFinite(maxH)) return { w: srcW, h: srcH };
  const noUpscale = opts.noUpscale !== false;
  if (opts.keepAspect !== false) {
    const fit = Math.min(maxW / srcW, maxH / srcH);
    const scale = noUpscale ? Math.min(fit, 1) : fit;
    return {
      w: Math.max(1, Math.round(srcW * scale)),
      h: Math.max(1, Math.round(srcH * scale)),
    };
  }
  let w = isFinite(maxW) ? maxW : srcW;
  let h = isFinite(maxH) ? maxH : srcH;
  if (noUpscale) { w = Math.min(srcW, w); h = Math.min(srcH, h); }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

// Source MIME types that may carry alpha — used to decide whether a JPEG
// output needs an opaque background fill.
function sourceHasAlpha(mime) {
  return mime === 'image/png' || mime === 'image/webp' || mime === 'image/avif' || mime === 'image/gif';
}

function swapExtension(filename, newExt) {
  const i = filename.lastIndexOf('.');
  const stem = i >= 0 ? filename.slice(0, i) : filename;
  return `${stem}.${newExt}`;
}

const FORMAT_INFO = {
  png:  { mime: 'image/png',  ext: 'png',  lossless: true  },
  jpeg: { mime: 'image/jpeg', ext: 'jpg',  lossless: false },
  webp: { mime: 'image/webp', ext: 'webp', lossless: false },
  avif: { mime: 'image/avif', ext: 'avif', lossless: false },
};

// Hand-rolled store-only zip (no compression). Inlined here so we don't pull
// a multi-kB zip library for what is fundamentally "concatenate Blobs with a
// header and a central directory."
async function buildStoreZip(entries) {
  const enc = new TextEncoder();
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, blob } of entries) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // local file header signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // method (0 = store)
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0, true);           // mod date
    lv.setUint32(14, crc, true);         // crc-32
    lv.setUint32(18, size, true);        // compressed size
    lv.setUint32(22, size, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra length
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);   // central dir signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}
