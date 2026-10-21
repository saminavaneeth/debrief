import { z } from "zod";
import { Confidence, Modality } from "./common";

/** Normalized bounding box: x, y, w, h in 0..1 relative to the image size. */
export const BoundingBox = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const Provenance = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("transcript_span"),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    type: z.literal("text_span"),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("image_region"),
    box: BoundingBox,
    /** Set when the image is a video keyframe. */
    frameMs: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    type: z.literal("document_field"),
    page: z.number().int().positive(),
    field: z.string(),
    excerpt: z.string(),
  }),
  z.strictObject({
    type: z.literal("capture_metadata"),
    field: z.enum(["capturedAt", "capturedBy", "siteId", "areaId", "assetTag", "tags"]),
  }),
]);

export const EvidenceKind = z.enum([
  "statement",
  "entity",
  "image_finding",
  "document_field",
  "ocr_text",
  "metadata",
]);

export const EvidenceSource = z.enum([
  "fixture",
  "speech_api",
  "ocr",
  "pdf_text",
  "user_tag",
  "user_edit",
  "capture",
]);

/** An atomic fact extracted from one artifact. Every drafted field points at one or more of these. */
export const Evidence = z.strictObject({
  id: z.string(),
  artifactId: z.string(),
  modality: Modality,
  kind: EvidenceKind,
  /** The fact in plain words, e.g. "FL-07 right-side mirror cracked". */
  text: z.string(),
  /** Taxonomy tag, entity type or document field name. */
  label: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  provenance: Provenance,
  confidence: Confidence,
  source: EvidenceSource,
});

export type BoundingBox = z.infer<typeof BoundingBox>;
export type Provenance = z.infer<typeof Provenance>;
export type EvidenceKind = z.infer<typeof EvidenceKind>;
export type Evidence = z.infer<typeof Evidence>;
