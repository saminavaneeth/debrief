import { z } from "zod";
import {
  Confidence,
  IsoDateTime,
  KnowledgeCitation,
  LinkType,
  RecordId,
  RecordType,
  ServerId,
} from "./common";

/** Reference to an existing record, or to a record created earlier in the same change set. */
export const RecordRef = z.union([
  z.strictObject({ id: RecordId }),
  z.strictObject({ actionId: z.string() }),
]);
export type RecordRef = z.infer<typeof RecordRef>;

export const PatchOp = z.strictObject({
  op: z.enum(["set", "append", "remove"]),
  /** Dot path; array items addressed by id, e.g. `items[FE-115].response`. */
  path: z.string(),
  value: z.unknown().optional(),
});
export type PatchOp = z.infer<typeof PatchOp>;

/** Why a drafted field has the value it has. A field with no support is a bug. */
export const FieldSupport = z.strictObject({
  source: z.enum(["evidence", "schema_default", "user", "derived"]),
  evidenceIds: z.array(z.string()).default([]),
  citations: z.array(KnowledgeCitation).default([]),
  /** For `derived`: the rule that computed it, e.g. "severity from treatment keywords". */
  rule: z.string().optional(),
});
export type FieldSupport = z.infer<typeof FieldSupport>;

export const Autonomy = z.enum(["auto", "approve", "blocked"]);
export const ActionStatus = z.enum([
  "proposed",
  "approved",
  "rejected",
  "executing",
  "executed",
  "failed",
]);

const ActionCommon = {
  id: z.string(),
  scenarioId: z.string(),
  dependsOn: z.array(z.string()).default([]),
  confidence: Confidence,
  rationale: z.string(),
  autonomy: Autonomy,
  status: ActionStatus,
  error: z.string().optional(),
  /** Record ID returned by the gateway after execution. */
  resultRecordId: RecordId.optional(),
};

export const CreateAction = z.strictObject({
  ...ActionCommon,
  type: z.literal("create"),
  server: ServerId,
  recordType: RecordType,
  payload: z.record(z.string(), z.unknown()),
  fieldSupport: z.record(z.string(), FieldSupport),
});

export const UpdateAction = z.strictObject({
  ...ActionCommon,
  type: z.literal("update"),
  server: ServerId,
  recordType: RecordType,
  targetId: RecordId,
  patch: z.array(PatchOp).min(1),
  /** Snapshot of the patched paths before the change, for the diff view. */
  before: z.record(z.string(), z.unknown()).default({}),
  fieldSupport: z.record(z.string(), FieldSupport),
  /** Match score that made this an update rather than a create. */
  matchScore: Confidence.optional(),
});

export const LinkAction = z.strictObject({
  ...ActionCommon,
  type: z.literal("link"),
  from: RecordRef,
  to: RecordRef,
  linkType: LinkType,
  fromItemId: z.string().optional(),
});

export const AttachAction = z.strictObject({
  ...ActionCommon,
  type: z.literal("attach"),
  artifactId: z.string(),
  to: RecordRef,
});

export const ProposedAction = z.discriminatedUnion("type", [
  CreateAction,
  UpdateAction,
  LinkAction,
  AttachAction,
]);
export type ProposedAction = z.infer<typeof ProposedAction>;

export const GapQuestion = z.strictObject({
  id: z.string(),
  scenarioId: z.string(),
  actionId: z.string(),
  fieldPath: z.string(),
  question: z.string(),
  required: z.boolean(),
  answerType: z.enum(["text", "person", "choice", "number", "date"]),
  options: z.array(z.strictObject({ value: z.string(), label: z.string() })).default([]),
  answer: z.unknown().optional(),
});
export type GapQuestion = z.infer<typeof GapQuestion>;

/** Agent suggestions about how captures are grouped. */
export const SortSuggestion = z.strictObject({
  id: z.string(),
  kind: z.enum(["move", "merge", "split"]),
  artifactIds: z.array(z.string()),
  fromScenarioId: z.string().nullable(),
  toScenarioId: z.string().nullable(),
  rationale: z.string(),
  confidence: Confidence,
});
export type SortSuggestion = z.infer<typeof SortSuggestion>;

export const ChangeSet = z.strictObject({
  id: z.string(),
  runId: z.string(),
  createdAt: IsoDateTime,
  scenarioIds: z.array(z.string()).min(1),
  status: z.enum(["draft", "in_review", "pushing", "pushed", "partially_pushed"]),
  actions: z.array(ProposedAction),
  gaps: z.array(GapQuestion).default([]),
  sortSuggestions: z.array(SortSuggestion).default([]),
});
export type ChangeSet = z.infer<typeof ChangeSet>;
