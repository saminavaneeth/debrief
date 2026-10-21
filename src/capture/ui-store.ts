"use client";

import { create } from "zustand";

/** Transient UI state shared across screens. Persistent state lives in IndexedDB. */
interface CaptureUi {
  /** Capture open in the details editor sheet. */
  editingId: string | null;
  edit: (id: string) => void;
  closeEditor: () => void;
  notice: { id: number; text: string; tone: "info" | "error" } | null;
  notify: (text: string, tone?: "info" | "error") => void;
  clearNotice: () => void;
}

let seq = 0;

export const useCaptureUi = create<CaptureUi>((set) => ({
  editingId: null,
  edit: (id) => set({ editingId: id }),
  closeEditor: () => set({ editingId: null }),
  notice: null,
  notify: (text, tone = "info") => set({ notice: { id: ++seq, text, tone } }),
  clearNotice: () => set({ notice: null }),
}));
