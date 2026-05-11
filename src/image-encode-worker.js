// Decode → optional resize/fit → encode pipeline run off the main thread.
//
// One job per message. The page is responsible for queueing and parallelism
// (kept simple for now: serial queue per worker, one worker per page).
//
// Inbound:
//   { id, file, opts: {
//       enabled, mode,                       // 'max' | 'exact' | 'percent'
//       maxW, maxH, keepAspect, noUpscale,   // max
//       targetW, targetH, fit, background,   // exact (fit: 'contain'|'cover'|'stretch')
//       scale,                               // percent (and noUpscale)
//       format,                              // 'png' | 'jpeg' | 'webp'
//       quality,                             // 0..1 for lossy formats
//     }
//   }
//
// Outbound:
//   { id, w, h, blob } | { id, error }

const FORMAT_INFO = {
  png:  { mime: 'image/png',  lossless: true  },
  jpeg: { mime: 'image/jpeg', lossless: false },
  webp: { mime: 'image/webp', lossless: false },
};

// Kept in sync with src/image-utils.js. Duplicated here so the worker has no
// build-time dependency on the page bundle (workers and page scripts are
// emitted as separate hashed assets by Parcel).
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

function drawResized(ctx, bitmap, opts, dstW, dstH) {
  if ((opts.mode || 'max') !== 'exact') {
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    return;
  }
  const fit = opts.fit || 'contain';
  if (fit === 'stretch') {
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    return;
  }
  const srcAspect = bitmap.width / bitmap.height;
  const dstAspect = dstW / dstH;
  if (fit === 'cover') {
    let sx, sy, sw, sh;
    if (srcAspect > dstAspect) {
      sh = bitmap.height;
      sw = sh * dstAspect;
      sx = (bitmap.width - sw) / 2;
      sy = 0;
    } else {
      sw = bitmap.width;
      sh = sw / dstAspect;
      sx = 0;
      sy = (bitmap.height - sh) / 2;
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dstW, dstH);
  } else {
    // contain: scale to fit inside, centered, with letterbox bars
    let dw, dh;
    if (srcAspect > dstAspect) {
      dw = dstW;
      dh = dstW / srcAspect;
    } else {
      dh = dstH;
      dw = dstH * srcAspect;
    }
    const dx = (dstW - dw) / 2;
    const dy = (dstH - dh) / 2;
    ctx.drawImage(bitmap, dx, dy, dw, dh);
  }
}

self.onmessage = async (e) => {
  const { id, file, opts } = e.data;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { w: dstW, h: dstH } = computeTargetSize(bitmap.width, bitmap.height, opts);

    const canvas = new OffscreenCanvas(dstW, dstH);
    const ctx = canvas.getContext('2d');

    // Background fill: required for JPEG (no alpha) and for exact/contain
    // when the user picked an opaque background instead of transparent.
    const needsBg =
      opts.format === 'jpeg' ||
      (opts.mode === 'exact' && (opts.fit || 'contain') === 'contain' &&
        opts.background && opts.background !== 'transparent');
    if (needsBg) {
      ctx.fillStyle = (opts.background && opts.background !== 'transparent') ? opts.background : '#ffffff';
      ctx.fillRect(0, 0, dstW, dstH);
    }

    drawResized(ctx, bitmap, opts, dstW, dstH);

    const info = FORMAT_INFO[opts.format] || FORMAT_INFO.png;
    const quality = info.lossless ? undefined : opts.quality;
    const blob = await canvas.convertToBlob({ type: info.mime, quality });

    self.postMessage({ id, w: dstW, h: dstH, blob });
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  } finally {
    bitmap?.close?.();
  }
};
