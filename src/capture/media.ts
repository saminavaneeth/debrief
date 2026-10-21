"use client";

/** Browser-side media helpers for captures. */

const MAX_PHOTO_EDGE = 2048;

/**
 * Downscale large photos to keep on-device storage small (JPEG, longest edge 2048 px).
 * Vector and animated images are kept as they are.
 */
export async function preparePhoto(
  file: File,
): Promise<{ blob: Blob; width?: number; height?: number }> {
  if (!file.type.startsWith("image/") || /svg|gif/.test(file.type)) return { blob: file };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close();
      return { blob: file, width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return { blob: blob ?? file, width, height };
  } catch {
    return { blob: file }; // e.g. HEIC the browser cannot decode: keep the original
  }
}

/** Duration and size of a video or audio blob, read from its metadata. */
export function mediaMetadata(
  blob: Blob,
  kind: "video" | "audio",
): Promise<{ durationMs?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(blob);
    const done = (v: { durationMs?: number; width?: number; height?: number }) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined;
      const v = el as HTMLVideoElement;
      done({
        durationMs: d,
        ...(kind === "video" && v.videoWidth ? { width: v.videoWidth, height: v.videoHeight } : {}),
      });
    };
    el.onerror = () => done({});
    el.src = url;
  });
}

/** First audio format this browser can record (Chrome/Edge: WebM Opus, Safari: MP4/AAC). */
export function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
