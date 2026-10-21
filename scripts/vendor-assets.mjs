// Copy browser-side OCR and PDF assets from node_modules into public/vendor/, so on-device
// perception works without a CDN. Runs after `npm install`; public/vendor/ is not committed.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public", "vendor");
const nm = (...p) => path.join(root, "node_modules", ...p);

const copies = [
  [nm("tesseract.js", "dist", "worker.min.js"), "tesseract/worker.min.js"],
  // LSTM-only cores (the browser picks the SIMD build it supports).
  [
    nm("tesseract.js-core", "tesseract-core-lstm.wasm.js"),
    "tesseract/core/tesseract-core-lstm.wasm.js",
  ],
  [
    nm("tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    "tesseract/core/tesseract-core-simd-lstm.wasm.js",
  ],
  [
    nm("tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"),
    "tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js",
  ],
  [
    nm("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
    "tesseract/lang/eng.traineddata.gz",
  ],
  [nm("pdfjs-dist", "build", "pdf.worker.min.mjs"), "pdfjs/pdf.worker.min.mjs"],
];

let copied = 0;
for (const [from, to] of copies) {
  const dest = path.join(out, to);
  if (!fs.existsSync(from)) {
    console.warn(`vendor-assets: missing ${path.relative(root, from)} (skipped)`);
    continue;
  }
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(from).size) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
  copied++;
}
console.log(`vendor-assets: ${copied} file(s) copied to public/vendor/`);
