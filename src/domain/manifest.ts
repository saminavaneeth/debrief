import { z } from "zod";
import { LinkType, RecordType, ServerId } from "./common";

/** How new evidence changes a matched record. */
export const UpdateMode = z.discriminatedUnion("mode", [
  /** Change fields that carry an `x-update` directive. */
  z.strictObject({ mode: z.literal("patch") }),
  /** Add the evidence as a new child item (e.g. an audit finding), drafted from the item schema. */
  z.strictObject({ mode: z.literal("append_child"), collection: z.string() }),
  /**
   * Fill in a checklist from a completed form: each form row is matched to a child item by
   * `itemKey`; `set` gives values for the record (`$captureTime`, `$aggregate` = fail if any
   * item fails, else pass).
   */
  z.strictObject({
    mode: z.literal("complete_checklist"),
    collection: z.string(),
    itemKey: z.string(),
    responseField: z.string(),
    notesField: z.string(),
    set: z.record(z.string(), z.string()),
  }),
]);
export type UpdateMode = z.infer<typeof UpdateMode>;

export const DraftingHints = z.strictObject({
  /**
   * Headline template. `{field}` inserts a drafted value (picklist label when there is one),
   * `{primary}` the key finding or statement, `{area}` the area name.
   */
  title: z.string(),
  /** Title template for a child item appended in `append_child` mode. */
  childTitle: z.string().optional(),
});

export const LinkingHints = z.strictObject({
  /**
   * Records of this type contain other findings (inspections, audits): other records in the same
   * change set link to them with `foundDuring`.
   */
  container: z.boolean().default(false),
});

/** How the matcher decides whether new evidence updates an existing record of this type. */
export const MatchingHints = z.strictObject({
  /**
   * `condition`: a lasting state (hazard, open audit) — new evidence about the same thing updates
   * the open record. `event`: something that happened once (incident, meeting) — only a record of
   * the same event inside `windowHours` is a match. `scheduled`: planned work (inspection) — the
   * scheduled record for the same date and assets is completed rather than duplicated.
   */
  strategy: z.enum(["condition", "event", "scheduled"]),
  /** Statuses in which a record can still be updated. */
  openStatuses: z.array(z.string()).min(1),
  /** Structured fields that raise the match score when they agree. */
  signals: z.array(z.string()).default([]),
  windowHours: z.number().int().positive().optional(),
  update: UpdateMode.default({ mode: "patch" }),
});

export const RoutingHints = z.strictObject({
  keywords: z.array(z.string()).min(1),
  exampleSituations: z.array(z.string()).min(1),
  useWhen: z.string(),
  /** Hazard taxonomy categories that point at this record type. */
  categories: z.array(z.string()).default([]),
});

export const ManifestRecordType = z.strictObject({
  recordType: RecordType,
  displayName: z.string(),
  idPrefix: z.string().regex(/^[A-Z]{3}$/),
  description: z.string(),
  routing: RoutingHints,
  matching: MatchingHints,
  /** Array fields holding child items, e.g. inspection `items`. */
  childCollections: z.array(z.string()).default([]),
  drafting: DraftingHints,
  linking: LinkingHints.default({ container: false }),
});

/** Published at `ehs://{server}/manifest`. Everything the orchestrator knows about a module. */
export const ServerManifest = z.strictObject({
  server: ServerId,
  displayName: z.string(),
  description: z.string(),
  version: z.string(),
  recordTypes: z.array(ManifestRecordType).min(1),
  linkTypes: z.array(LinkType).min(1),
});

export type MatchingHints = z.infer<typeof MatchingHints>;
export type RoutingHints = z.infer<typeof RoutingHints>;
export type ManifestRecordType = z.infer<typeof ManifestRecordType>;
export type ServerManifest = z.infer<typeof ServerManifest>;

export const PicklistOption = z.strictObject({
  value: z.union([z.string(), z.number()]),
  label: z.string(),
});
/** Published at `ehs://{server}/picklists`. */
export const Picklists = z.record(z.string(), z.array(PicklistOption));
export type Picklists = z.infer<typeof Picklists>;
