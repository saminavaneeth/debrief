import { z } from "zod";
import { FieldCondition, LinkType, RecordType, ServerId } from "./common";
import { PatchOp } from "./changeset";

export const RecordEvent = z.enum(["record.created", "record.updated", "record.linked"]);

export const Trigger = z.strictObject({
  event: z.union([RecordEvent, z.array(RecordEvent).min(1)]),
  server: ServerId.optional(),
  recordType: RecordType.optional(),
});

/** Aggregate condition over recent records, e.g. 3+ hazards in the same area within 30 days. */
export const AggregateCondition = z.strictObject({
  groupBy: z.string(),
  window: z.string().regex(/^\d+d$/, "Expected e.g. 30d"),
  /** Which timestamp counts as activity in the window. */
  activity: z.enum(["created", "created_or_updated"]),
  count: z.strictObject({ op: z.enum(["gte", "gt", "eq"]), value: z.number().int().positive() }),
});

/** `"trigger"` is the record that triggered the rule; otherwise a fixed record id. */
const TargetRef = z.union([
  z.literal("trigger"),
  z.string().regex(/^(INC|AUD|MTG|HAZ|OBS|INS|TRN)-\d{4}$/),
]);

export const WorkflowAction = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("notify"),
    to: z.string(),
    template: z.string(),
  }),
  z.strictObject({
    type: z.literal("create_record"),
    server: ServerId,
    recordType: RecordType,
    /** Values may use `{{field}}` templates resolved against the trigger record. */
    payload: z.record(z.string(), z.unknown()),
    linkToTrigger: z.strictObject({ type: LinkType }).optional(),
  }),
  z.strictObject({
    type: z.literal("update_record"),
    target: TargetRef,
    patch: z.array(PatchOp).min(1),
  }),
  z.strictObject({
    type: z.literal("link_records"),
    from: TargetRef,
    to: TargetRef,
    linkType: LinkType,
  }),
  z.strictObject({
    type: z.literal("suggest"),
    title: z.string(),
    template: z.string(),
    proposal: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export const WorkflowRule = z.strictObject({
  id: z.string().regex(/^wf-[a-z0-9-]+$/),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  trigger: Trigger,
  conditions: z.array(FieldCondition).default([]),
  aggregate: AggregateCondition.optional(),
  /**
   * Evaluate actions once per matching child item (e.g. each failed inspection item) instead of
   * once per record. `where` filters the items; `unlessLinked` skips items already linked to a
   * record of that type.
   */
  forEach: z
    .strictObject({
      path: z.string(),
      where: z.array(FieldCondition).default([]),
      unlessLinked: RecordType.optional(),
    })
    .optional(),
  actions: z.array(WorkflowAction).min(1),
});

export type WorkflowRule = z.infer<typeof WorkflowRule>;
export type WorkflowAction = z.infer<typeof WorkflowAction>;
