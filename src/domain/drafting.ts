import { z } from "zod";

/**
 * Drafting directives a module publishes on its schema fields (`x-fill`, `x-update`). They tell
 * any drafter which kind of evidence fills the field, so the orchestrator itself holds no
 * module-specific rules. Keyword lists use whole-word matching; `*` stands for up to three words.
 */

const Keywords = z.array(z.string().min(1)).min(1);

export const FillDirective = z.discriminatedUnion("kind", [
  /** Headline from the record type's title template in the manifest. */
  z.strictObject({ kind: z.literal("title") }),
  /** Plain-language account built from the spoken and written statements. */
  z.strictObject({ kind: z.literal("statements") }),
  z.strictObject({ kind: z.literal("site") }),
  z.strictObject({ kind: z.literal("area") }),
  z.strictObject({ kind: z.literal("assets") }),
  z.strictObject({ kind: z.literal("contractor") }),
  /** The person who captured the evidence. */
  z.strictObject({ kind: z.literal("capturer") }),
  /** When it happened: a spoken or written time, else the earliest capture time. */
  z.strictObject({
    kind: z.literal("eventTime"),
    documentFields: z.strictObject({ date: z.string(), time: z.string() }).optional(),
  }),
  /** Enum value whose keywords match most often. */
  z.strictObject({
    kind: z.literal("enumKeywords"),
    map: z.record(z.string(), Keywords),
    negation: z.boolean().default(true),
  }),
  /** `true` when any cue matches (not negated). */
  z.strictObject({ kind: z.literal("flag"), cues: Keywords }),
  /** A person: a named document field, or a person named in a sentence with one of the cues. */
  z.strictObject({
    kind: z.literal("person"),
    cues: Keywords.optional(),
    documentField: z.string().optional(),
    fallback: z.literal("capturer").optional(),
  }),
  /** People mentioned, with a role chosen by cue words in the same sentence. */
  z.strictObject({ kind: z.literal("people"), roles: z.record(z.string(), Keywords) }),
  /** Hazard taxonomy category from keywords, image findings and quick tags. */
  z.strictObject({ kind: z.literal("category") }),
  /** A named EHS classification rule (severity, recordability, …), with knowledge citations. */
  z.strictObject({
    kind: z.literal("rule"),
    rule: z.enum([
      "severity",
      "severityFromCategory",
      "riskFromCategory",
      "injury",
      "recordability",
      "recordabilityBasis",
    ]),
  }),
  /** Sentences describing actions already taken. */
  z.strictObject({ kind: z.literal("actions"), cues: Keywords }),
  /** Value from the other record types proposed in the same change set. */
  z.strictObject({
    kind: z.literal("context"),
    map: z.record(z.string(), z.string()),
    default: z.string().optional(),
  }),
  /** Corrective actions from the guidance in the knowledge documents for the category. */
  z.strictObject({ kind: z.literal("guidance") }),
  /** The regulation paragraph that applies, from the knowledge index. */
  z.strictObject({ kind: z.literal("regulation") }),
  /** A labelled field on a document (e.g. `Topic:`), else the clause after a cue. */
  z.strictObject({
    kind: z.literal("documentField"),
    field: z.string(),
    cues: Keywords.optional(),
  }),
  z.strictObject({ kind: z.literal("duration") }),
  /** People listed on a sign-in sheet, matched to the roster; unknown names become questions. */
  z.strictObject({ kind: z.literal("roster") }),
  /** Follow-up actions with owner and due date. */
  z.strictObject({ kind: z.literal("actionItems"), cues: Keywords }),
]);
export type FillDirective = z.infer<typeof FillDirective>;

export const UpdateDirective = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("enumKeywords"),
    map: z.record(z.string(), Keywords),
    negation: z.boolean().default(true),
  }),
  /** Raise an ordered enum one step when the change set links this record to one of these types. */
  z.strictObject({ kind: z.literal("raiseIfLinked"), types: z.array(z.string()).min(1) }),
  /** Append a note summarising the new evidence. */
  z.strictObject({ kind: z.literal("note") }),
]);
export type UpdateDirective = z.infer<typeof UpdateDirective>;
