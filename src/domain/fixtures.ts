import { z } from "zod";
import { Confidence, IsoDate, LinkType, RecordId, RecordType, ServerId } from "./common";
import { Artifact, Scenario, Shift } from "./capture";
import { BoundingBox } from "./evidence";

/* ------------------------------------------------------------------ perception fixtures */
/* What a speech, vision or document model would return for a demo artifact. In demo mode    */
/* this is the only faked step; everything downstream runs for real.                          */

export const ImageFinding = z.strictObject({
  id: z.string(),
  /** Hazard taxonomy category id or object label. */
  label: z.string(),
  text: z.string(),
  box: BoundingBox,
  confidence: Confidence,
});

export const TranscriptPerception = z.strictObject({
  kind: z.literal("transcript"),
  text: z.string().min(1),
  language: z.string().default("en-US"),
});

export const ImagePerception = z.strictObject({
  kind: z.literal("image"),
  findings: z.array(ImageFinding),
  /** Text a real OCR pass would read off the image (asset tags, signs, handwriting). */
  ocrText: z.string().optional(),
});

export const VideoPerception = z.strictObject({
  kind: z.literal("video"),
  keyframes: z
    .array(
      z.strictObject({
        atMs: z.number().int().nonnegative(),
        uri: z.string(),
        findings: z.array(ImageFinding),
      }),
    )
    .min(1),
  transcript: z.string().optional(),
});

export const DocumentPerception = z.strictObject({
  kind: z.literal("document"),
  /** pdf: text layer read with pdfjs; image: OCR of a photographed paper form. */
  source: z.enum(["pdf", "image"]),
  templateId: z.string().optional(),
  /** Raw text as extracted, one line per row. Also the source used to generate the demo PDF. */
  text: z.string().min(1),
});

export const PerceptionFixture = z.discriminatedUnion("kind", [
  TranscriptPerception,
  ImagePerception,
  VideoPerception,
  DocumentPerception,
]);
export type PerceptionFixture = z.infer<typeof PerceptionFixture>;

/** A paraphrased version of the scenario: same facts, different wording. */
export const ScenarioVariant = z.strictObject({
  id: z.string().regex(/^S\d+-v\d+$/),
  description: z.string(),
  /** Replacement perception per artifact id (typically transcripts). */
  perception: z.record(z.string(), PerceptionFixture).default({}),
  /** Replacement note text per artifact id. */
  artifactText: z.record(z.string(), z.string()).default({}),
});

export const ScenarioFixture = z.strictObject({
  id: z.string().regex(/^S\d+$/),
  title: z.string(),
  summary: z.string(),
  shift: Shift,
  scenarios: z.array(Scenario).min(1),
  artifacts: z.array(Artifact).min(1),
  perception: z.record(z.string(), PerceptionFixture),
  variants: z.array(ScenarioVariant).default([]),
});
export type ScenarioFixture = z.infer<typeof ScenarioFixture>;

/* ------------------------------------------------------------------ expected change sets */

export const ExpectedRef = z.union([
  z.strictObject({ id: RecordId }),
  z.strictObject({ ref: z.string() }),
]);

/**
 * An array element that must exist at `path`. For arrays of objects, string values in `match`
 * are compared as case-insensitive substrings and all other values must be equal. For arrays of
 * strings, `match` is a substring one element must contain.
 */
export const ExpectedIncludes = z.strictObject({
  path: z.string(),
  match: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

export const ExpectedAction = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("create"),
    ref: z.string(),
    scenarioId: z.string(),
    server: ServerId,
    recordType: RecordType,
    /** Exact values after normalization. */
    fields: z.record(z.string(), z.unknown()).default({}),
    /** Case-insensitive substrings, for free-text fields such as title or topic. */
    fieldsContain: z.record(z.string(), z.string()).default({}),
    includes: z.array(ExpectedIncludes).default([]),
  }),
  z.strictObject({
    type: z.literal("update"),
    ref: z.string(),
    scenarioId: z.string(),
    server: ServerId,
    recordType: RecordType,
    targetId: RecordId,
    fields: z.record(z.string(), z.unknown()).default({}),
    fieldsContain: z.record(z.string(), z.string()).default({}),
    includes: z.array(ExpectedIncludes).default([]),
  }),
  z.strictObject({
    type: z.literal("link"),
    ref: z.string(),
    scenarioId: z.string(),
    from: ExpectedRef,
    to: ExpectedRef,
    linkType: LinkType,
    fromItemId: z.string().optional(),
    toItemId: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("attach"),
    ref: z.string(),
    scenarioId: z.string(),
    artifactId: z.string(),
    to: ExpectedRef,
  }),
]);
export type ExpectedAction = z.infer<typeof ExpectedAction>;

export const ExpectedChangeSet = z.strictObject({
  scenarioId: z.string().regex(/^S\d+$/),
  /** Fixed "today" used for relative due dates in this scenario. */
  demoDate: IsoDate,
  actions: z.array(ExpectedAction).min(1),
  gaps: z.array(z.strictObject({ actionRef: z.string(), fieldPath: z.string() })).default([]),
  citations: z
    .array(z.strictObject({ actionRef: z.string(), fieldPath: z.string(), docId: z.string() }))
    .default([]),
  sortSuggestions: z
    .array(
      z.strictObject({
        kind: z.enum(["move", "merge", "split"]),
        artifactIds: z.array(z.string()),
        toScenarioId: z.string().nullable(),
      }),
    )
    .default([]),
  /** Records that must not be created (duplicate prevention). */
  forbidden: z
    .array(
      z.strictObject({
        reason: z.string(),
        server: ServerId,
        recordType: RecordType,
        maxCreates: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  /** Workflow outcomes after push; `fires` means the rule executed at least one action. */
  workflows: z.array(z.strictObject({ ruleId: z.string(), fires: z.boolean() })).default([]),
});
export type ExpectedChangeSet = z.infer<typeof ExpectedChangeSet>;
