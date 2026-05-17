// Bundleable entry point for the pdfjs-dist web worker.
// Referenced via new Worker(new URL('./pdf-worker-entry.js', import.meta.url))
// so Parcel outputs a proper .js chunk (not an extensionless file).
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
