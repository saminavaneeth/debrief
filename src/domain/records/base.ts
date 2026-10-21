import { z } from "zod";
import {
  AreaId,
  AssetId,
  type FieldCondition,
  IsoDate,
  IsoDateTime,
  KnowledgeCitation,
  LinkType,
  OwnerRef,
  PersonId,
  RecordId,
  ServerId,
  SiteId,
} from "../common";
import { Provenance } from "../evidence";

/**
 * Field-level metadata carried into each module's JSON Schema (via Zod `.meta()`), so the
 * orchestrator can read extraction hints and conditional requirements at runtime.
 */
export type FieldMeta = {
  description: string;
  /** Hint for the drafter: which words or entities usually fill this field. */
  "x-extractionHint"?: string;
  /** All conditions must hold for the field to be required. */
  "x-requiredWhen"?: FieldCondition[];
  /** Question asked when the field is required but no evidence supports a value. */
  "x-gapQuestion"?: string;
  /** Name of a shared picklist in `ehs://{server}/picklists`. */
  "x-picklist"?: string;
};

export const meta = (m: FieldMeta) => m;

/** Who performed a write: a person, the agent (on behalf of a person), or a workflow rule. */
export const Actor = z.string().regex(/^([PC]-\d{3}|agent|workflow:[a-z0-9-]+|system)$/);

export const CorrectiveActionStatus = z.enum(["open", "in_progress", "done", "cancelled"]);

export const CorrectiveAction = z.strictObject({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  ownerRef: OwnerRef,
  dueDate: IsoDate,
  status: CorrectiveActionStatus,
  createdAt: IsoDateTime,
  createdBy: Actor,
  citations: z.array(KnowledgeCitation).default([]),
});

export const RecordLink = z.strictObject({
  type: LinkType,
  targetId: RecordId,
  /** Child item on this record the link starts from (inspection item, audit finding). */
  itemId: z.string().optional(),
  /** Child item on the target record the link points at. */
  targetItemId: z.string().optional(),
  createdAt: IsoDateTime,
  createdBy: Actor,
});

/**
 * Link type written on the target record when a link is created. `resultedIn` has two possible
 * inverses (`causedBy`, `foundDuring`); callers that need `foundDuring` link from the other side.
 */
export const LINK_INVERSE = {
  relatedTo: "relatedTo",
  causedBy: "resultedIn",
  foundDuring: "resultedIn",
  resultedIn: "causedBy",
} as const;

export const AttachedEvidence = z.strictObject({
  artifactId: z.string(),
  modality: z.enum(["voice", "photo", "video", "document", "note"]),
  uri: z.string().optional(),
  caption: z.string().optional(),
  provenance: Provenance.optional(),
  attachedAt: IsoDateTime,
  attachedBy: Actor,
});

export const Note = z.strictObject({
  at: IsoDateTime,
  by: Actor,
  text: z.string(),
});

export const HistoryAction = z.enum([
  "created",
  "updated",
  "status_changed",
  "linked",
  "attached",
  "noted",
]);

export const FieldChange = z.strictObject({
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

export const HistoryEntry = z.strictObject({
  at: IsoDateTime,
  by: Actor,
  action: HistoryAction,
  summary: z.string(),
  changeSetId: z.string().optional(),
  changes: z.array(FieldChange).default([]),
});

/** Fields shared by every record in every module. Type-specific fields are flat on the record. */
export const RecordBase = z.strictObject({
  id: RecordId,
  server: ServerId,
  title: z
    .string()
    .min(1)
    .meta(meta({ description: "Short headline for the record." })),
  description: z
    .string()
    .meta(meta({ description: "What happened or what was found, in plain language." })),
  siteId: SiteId.meta(meta({ description: "Site where it happened." })),
  areaId: AreaId.optional().meta(
    meta({
      description: "Area within the site.",
      "x-extractionHint": "Gazetteer match on area names and aliases; else capture location.",
    }),
  ),
  assetIds: z
    .array(AssetId)
    .default([])
    .meta(meta({ description: "Equipment involved, by asset tag (e.g. FL-07)." })),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  createdBy: Actor,
  reportedBy: PersonId.optional().meta(meta({ description: "Person who reported it." })),
  notes: z.array(Note).default([]),
  correctiveActions: z.array(CorrectiveAction).default([]),
  links: z.array(RecordLink).default([]),
  evidence: z.array(AttachedEvidence).default([]),
  history: z.array(HistoryEntry).default([]),
});

export type CorrectiveAction = z.infer<typeof CorrectiveAction>;
export type RecordLink = z.infer<typeof RecordLink>;
export type AttachedEvidence = z.infer<typeof AttachedEvidence>;
export type Note = z.infer<typeof Note>;
export type HistoryEntry = z.infer<typeof HistoryEntry>;
export type RecordBase = z.infer<typeof RecordBase>;
