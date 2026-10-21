"use client";

import type { Artifact, PerceptionFixture } from "@/domain";
import { getDb } from "./db";
import { tagName } from "./reference";

/**
 * Perception for the user's own captures, on this device: OCR (tesseract.js) for photos and
 * photographed forms, PDF text (pdf.js), keyframes for videos, quick tags and captions as
 * findings. Results are cached in IndexedDB. Demo captures use their fixtures instead.
 */

type TesseractWorker = { recognize(image: Blob): Promise<{ data: { text: string } }> };
let ocrWorker: Promise<TesseractWorker> | null = null;

function getOcr(): Promise<TesseractWorker> {
  ocrWorker ??= import("tesseract.js").then(
    ({ createWorker }) =>
      createWorker("eng", 1, {
        workerPath: "/vendor/tesseract/worker.min.js",
        corePath: "/vendor/tesseract/core",
        langPath: "/vendor/tesseract/lang",
        gzip: true,
      }) as unknown as Promise<TesseractWorker>,
  );
  return ocrWorker;
}

export async function ocrImage(blob: Blob): Promise<string> {
  const worker = await getOcr();
  const { data } = await worker.recognize(blob);
  return data.text.replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * PDF text with layout: items on the same line are joined, wide gaps become two spaces, and
 * lines with four or more separated cells are written as `a | b | c` table rows.
 */
export async function pdfText(blob: Blob): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; w: number; s: string }[]>();
    for (const item of content.items as { str: string; transform: number[]; width: number }[]) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4], w: item.width, s: item.str }]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const cells = rows.get(y)!.sort((a, b) => a.x - b.x);
      const parts: string[] = [];
      let gaps = 0;
      cells.forEach((c, i) => {
        const prev = cells[i - 1];
        const gap = prev ? c.x - (prev.x + prev.w) : 0;
        if (prev && gap > 12) gaps++;
        parts.push(prev ? (gap > 12 ? "\u0000" : gap > 1 ? " " : "") + c.s : c.s);
      });
      const line = parts.join("");
      out.push(
        gaps >= 3
          ? line
              .split("\u0000")
              .map((x) => x.trim())
              .join(" | ")
          : line.replaceAll("\u0000", "  "),
      );
    }
  }
  return out.join("\n");
}

/** Grab up to `count` frames from a video as JPEG blobs. */
export async function extractKeyframes(
  blob: Blob,
  count = 4,
): Promise<{ atMs: number; blob: Blob }[]> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video could not be decoded"));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || !video.videoWidth) return [];
    const scale = Math.min(1, 640 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    const frames: { atMs: number; blob: Blob }[] = [];
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
      if (frame) frames.push({ atMs: Math.round(t * 1000), blob: frame });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FULL = { x: 0, y: 0, w: 1, h: 1 };

function tagFindings(a: Artifact, prefix: string) {
  return a.tags.map((t, i) => ({
    id: `${prefix}-T${i + 1}`,
    label: t,
    text: a.text?.trim() || tagName(t),
    box: FULL,
    confidence: 0.7,
  }));
}

async function perceive(a: Artifact): Promise<PerceptionFixture | undefined> {
  const blob = (await getDb().blobs.get(a.id))?.blob;
  switch (a.modality) {
    case "photo": {
      const ocrText = blob ? await ocrImage(blob).catch(() => "") : "";
      return { kind: "image", findings: tagFindings(a, a.id), ...(ocrText ? { ocrText } : {}) };
    }
    case "video": {
      if (!blob) return undefined;
      const frames = await extractKeyframes(blob).catch(() => []);
      if (frames.length === 0) return undefined;
      const db = getDb();
      for (const f of frames)
        await db.blobs.put({ artifactId: `${a.id}#kf${f.atMs}`, blob: f.blob });
      return {
        kind: "video",
        keyframes: frames.map((f, i) => ({
          atMs: f.atMs,
          uri: `blob:${a.id}#kf${f.atMs}`,
          findings: i === 0 ? tagFindings(a, `${a.id}-K0`) : [],
        })),
        ...(a.text ? { transcript: a.text } : {}),
      };
    }
    case "document": {
      if (!blob) return undefined;
      const isPdf = blob.type === "application/pdf" || a.media?.mimeType === "application/pdf";
      const text = isPdf
        ? await pdfText(blob).catch(() => "")
        : await ocrImage(blob).catch(() => "");
      return text ? { kind: "document", source: isPdf ? "pdf" : "image", text } : undefined;
    }
    default:
      return undefined; // voice and notes are read from their text
  }
}

/**
 * Perception for every artifact: demo fixtures, cached device results, or a fresh on-device pass
 * (OCR, PDF text, keyframes). `onProgress` reports each artifact being read.
 */
export async function ensurePerception(
  artifacts: Artifact[],
  onProgress?: (artifact: Artifact) => void,
): Promise<Record<string, PerceptionFixture>> {
  const db = getDb();
  const out: Record<string, PerceptionFixture> = {};
  for (const a of artifacts) {
    const cached = await db.perception.get(a.id);
    if (cached) {
      out[a.id] = cached.perception;
      continue;
    }
    if (!["photo", "video", "document"].includes(a.modality)) continue;
    onProgress?.(a);
    const p = await perceive(a);
    if (p) {
      out[a.id] = p;
      await db.perception.put({ artifactId: a.id, source: "device", perception: p });
    }
  }
  return out;
}
