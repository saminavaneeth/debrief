import { z } from "zod";

/** ISO-8601 timestamp with an explicit UTC offset, e.g. 2026-10-21T08:40:00-05:00. */
export const IsoDateTime = z.iso.datetime({ offset: true });
/** Calendar date, e.g. 2026-10-24. */
export const IsoDate = z.iso.date();

export const Confidence = z.number().min(0).max(1);

export const ServerId = z.enum([
  "incidents",
  "audits",
  "meetings",
  "hazards",
  "inspections",
  "training",
]);
export type ServerId = z.infer<typeof ServerId>;

export const RecordType = z.enum([
  "incident",
  "audit",
  "safety_meeting",
  "hazard",
  "observation",
  "inspection",
  "training_assignment",
]);
export type RecordType = z.infer<typeof RecordType>;

export const RECORD_TYPE_PREFIX = {
  incident: "INC",
  audit: "AUD",
  safety_meeting: "MTG",
  hazard: "HAZ",
  observation: "OBS",
  inspection: "INS",
  training_assignment: "TRN",
} as const satisfies Record<RecordType, string>;

export const RECORD_TYPE_SERVER = {
  incident: "incidents",
  audit: "audits",
  safety_meeting: "meetings",
  hazard: "hazards",
  observation: "hazards",
  inspection: "inspections",
  training_assignment: "training",
} as const satisfies Record<RecordType, ServerId>;

export const RecordId = z
  .string()
  .regex(/^(INC|AUD|MTG|HAZ|OBS|INS|TRN)-\d{4}$/, "Expected e.g. INC-0001");
export type RecordId = z.infer<typeof RecordId>;

export const PersonId = z
  .string()
  .regex(/^[PC]-\d{3}$/, "Expected P-001 (employee) or C-001 (contractor)");
export const RoleRef = z.string().regex(/^role:[a-z_]+$/, "Expected role:<role_id>");
/** A person or a role (resolved to people at notification/assignment time). */
export const OwnerRef = z.union([PersonId, RoleRef]);

export const SiteId = z.string().regex(/^[a-z0-9-]+$/);
export const AreaId = z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, "Expected <site>.<area>");
export const AssetId = z
  .string()
  .regex(/^[A-Z]{1,3}-\d{2,3}$/, "Expected e.g. FL-07, FE-115, V-22");

export const Modality = z.enum(["voice", "photo", "video", "document", "note"]);
export type Modality = z.infer<typeof Modality>;

/** 1 minimal · 2 minor · 3 moderate · 4 serious · 5 critical */
export const Severity = z.number().int().min(1).max(5);
export const RiskLevel = z.enum(["low", "medium", "high", "critical"]);

export const LinkType = z.enum(["relatedTo", "causedBy", "resultedIn", "foundDuring"]);
export type LinkType = z.infer<typeof LinkType>;

/** Pointer into the knowledge index used to ground a classification or suggestion. */
export const KnowledgeCitation = z.strictObject({
  docId: z.string(),
  section: z.string().optional(),
  excerpt: z.string().optional(),
});
export type KnowledgeCitation = z.infer<typeof KnowledgeCitation>;

/**
 * Generic field condition, shared by schema metadata (`x-requiredWhen`) and workflow rules.
 * `field` is a dot path into the record.
 */
export const ConditionOp = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "contains",
  "exists",
  "notExists",
  "notEmpty",
]);
export const FieldCondition = z.strictObject({
  field: z.string(),
  op: ConditionOp,
  value: z.unknown().optional(),
});
export type FieldCondition = z.infer<typeof FieldCondition>;
