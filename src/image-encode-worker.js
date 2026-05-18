// Decode → optional resize/fit → encode pipeline run off the main thread.
//
// One job per message. The page is responsible for queueing and parallelism
// (kept simple for now: serial queue per worker, one worker per page).
//
// Inbound (encode — default when `type` is omitted):
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
// Inbound (crop — used by the image cropper):
//   { id, type: 'crop', file, opts: {
//       sx, sy, sw, sh,                      // source rectangle in source pixels
//       format,                              // 'png' | 'jpeg' | 'webp'
//       quality,                             // 0..1 for lossy formats
//       circle,                              // true → clip to an inscribed circle (alpha corners)
//       background,                          // opaque colour for JPEG-on-alpha (default '#ffffff')
//     }
//   }
//
// Outbound:
//   { id, w, h, blob } | { id, error }

const FORMAT_INFO = {
  png: { mime: 'image/png', lossless: true },
  jpeg: { mime: 'image/jpeg', lossless: false },
  webp: { mime: 'image/webp', lossless: false },
  avif: { mime: 'image/avif', lossless: false },
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
  if (noUpscale) {
    w = Math.min(srcW, w);
    h = Math.min(srcH, h);
  }
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

// Binary-search the quality value until the output blob falls inside
// `targetBytes ± tolerance`, or `maxIter` iterations have run.
// Returns the best blob found (smallest one ≤ upper bound, or the smallest
// tried overall if even the most aggressive quality was too big).
async function compressToTarget(canvas, mime, targetBytes, tolerance, maxIter) {
  const tol = tolerance ?? 0.05;
  const cap = Math.max(1, maxIter || 8);
  const upper = targetBytes * (1 + tol);
  const lower = targetBytes * (1 - tol);
  let lo = 0.3,
    hi = 1.0;
  let best = null; // last blob ≤ upper
  let smallest = null; // smallest tried, regardless of target
  let iterations = 0;
  for (let i = 0; i < cap; i++) {
    iterations = i + 1;
    const q = (lo + hi) / 2;
    const blob = await canvas.convertToBlob({ type: mime, quality: q });
    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, q };
    if (blob.size <= upper) {
      best = { blob, q };
      if (blob.size >= lower) break;
      lo = q; // we have headroom — push quality up
    } else {
      hi = q; // shrink further
    }
  }
  const winner = best || smallest;
  return { blob: winner.blob, finalQuality: winner.q, iterations, hitTarget: !!best };
}

async function runCrop(id, file, opts) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const srcW = bitmap.width;
    const srcH = bitmap.height;

    // Clamp the crop rect to the source bounds — protects against rounding
    // mismatches between the preview coordinate system and the actual decoded
    // dimensions (EXIF rotation in particular can shift things by ±1 px).
    let sx = Math.max(0, Math.floor(opts.sx || 0));
    let sy = Math.max(0, Math.floor(opts.sy || 0));
    let sw = Math.max(1, Math.floor(opts.sw || srcW));
    let sh = Math.max(1, Math.floor(opts.sh || srcH));
    if (sx + sw > srcW) sw = srcW - sx;
    if (sy + sh > srcH) sh = srcH - sy;

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    if (opts.format === 'jpeg') {
      ctx.fillStyle =
        opts.background && opts.background !== 'transparent' ? opts.background : '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
    }
    if (opts.circle) {
      // Clip to the inscribed circle so the corners go transparent on alpha
      // formats. JPEG would render them as the background fill above, which
      // defeats the whole feature — the page disables JPEG for circles.
      ctx.save();
      ctx.beginPath();
      const r = Math.min(sw, sh) / 2;
      ctx.arc(sw / 2, sh / 2, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    if (opts.circle) ctx.restore();

    const info = FORMAT_INFO[opts.format] || FORMAT_INFO.png;
    const quality = info.lossless ? undefined : opts.quality;
    const blob = await canvas.convertToBlob({ type: info.mime, quality });
    self.postMessage({ id, w: sw, h: sh, blob });
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  } finally {
    bitmap?.close?.();
  }
}

self.onmessage = async (e) => {
  const { id, type, file, opts } = e.data;
  if (type === 'crop') {
    return runCrop(id, file, opts);
  }
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
      (opts.mode === 'exact' &&
        (opts.fit || 'contain') === 'contain' &&
        opts.background &&
        opts.background !== 'transparent');
    if (needsBg) {
      ctx.fillStyle =
        opts.background && opts.background !== 'transparent' ? opts.background : '#ffffff';
      ctx.fillRect(0, 0, dstW, dstH);
    }

    drawResized(ctx, bitmap, opts, dstW, dstH);

    const info = FORMAT_INFO[opts.format] || FORMAT_INFO.png;

    // Target-size mode — only meaningful for lossy formats. The page should
    // route lossless presets to a non-target encode path.
    if (opts.targetKB && !info.lossless) {
      const result = await compressToTarget(
        canvas,
        info.mime,
        opts.targetKB * 1024,
        opts.tolerance,
        opts.maxIterations,
      );
      self.postMessage({
        id,
        w: dstW,
        h: dstH,
        blob: result.blob,
        finalQuality: result.finalQuality,
        iterations: result.iterations,
        hitTarget: result.hitTarget,
      });
    } else {
      const quality = info.lossless ? undefined : opts.quality;
      const blob = await canvas.convertToBlob({ type: info.mime, quality });
      self.postMessage({ id, w: dstW, h: dstH, blob });
    }
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  } finally {
    bitmap?.close?.();
  }
};
