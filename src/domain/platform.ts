import { z } from "zod";
import { IsoDateTime, RecordId, RecordType, ServerId } from "./common";
import { Autonomy } from "./changeset";

/* ------------------------------------------------------------------ registry (mcp.config.json) */

export const ServerTransport = z.discriminatedUnion("type", [
  /** Same Node process, real MCP protocol over a linked in-memory transport. */
  z.strictObject({ type: z.literal("in-process") }),
  z.strictObject({ type: z.literal("http"), url: z.url() }),
  z.strictObject({
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).default([]),
  }),
]);

export const RegistryEntry = z.strictObject({
  id: ServerId,
  enabled: z.boolean(),
  transport: ServerTransport,
});

export const McpConfig = z.strictObject({
  servers: z.array(RegistryEntry).min(1),
});

export type ServerTransport = z.infer<typeof ServerTransport>;
export type RegistryEntry = z.infer<typeof RegistryEntry>;
export type McpConfig = z.infer<typeof McpConfig>;

/* ------------------------------------------------------------------ policy (data/policy.json) */

export const ToolName = z.enum([
  "search_records",
  "get_record",
  "create_record",
  "update_record",
  "attach_evidence",
  "link_records",
  "validate_record",
]);
export type ToolName = z.infer<typeof ToolName>;

export const AutonomyRule = z.strictObject({
  action: z.enum(["create", "update", "link", "attach"]),
  server: ServerId.optional(),
  recordType: RecordType.optional(),
  /** For attach/link/update: whether the target already existed before this change set. */
  target: z.enum(["existing", "new"]).optional(),
  level: Autonomy,
  note: z.string().optional(),
});
export type AutonomyRule = z.infer<typeof AutonomyRule>;

export const PolicyConfig = z.strictObject({
  /** Role id → allowed tool patterns: `create_record`, `incidents.*`, `*.get_record`, `*`. */
  roles: z.record(z.string(), z.array(z.string())),
  /** First matching rule wins; `defaultAutonomy` applies when none match. */
  autonomy: z.array(AutonomyRule),
  defaultAutonomy: Autonomy,
});
export type PolicyConfig = z.infer<typeof PolicyConfig>;

/* ------------------------------------------------------------------ audit + events */

export const CallContext = z.strictObject({
  /** Person on whose behalf the call is made, or `workflow:<id>` / `system`. */
  actor: z.string(),
  roles: z.array(z.string()),
  /** Who issued the call: the user directly, the agent, or a workflow rule. */
  via: z.enum(["user", "agent", "workflow", "system"]),
  changeSetId: z.string().optional(),
  actionId: z.string().optional(),
});
export type CallContext = z.infer<typeof CallContext>;

export const AuditEntry = z.strictObject({
  id: z.string(),
  at: IsoDateTime,
  actor: z.string(),
  via: CallContext.shape.via,
  /** Namespaced tool, e.g. `incidents.create_record`. */
  tool: z.string(),
  argsHash: z.string(),
  ok: z.boolean(),
  recordId: RecordId.optional(),
  error: z.string().optional(),
  changeSetId: z.string().optional(),
  actionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  latencyMs: z.number().nonnegative(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const RecordEventType = z.enum(["record.created", "record.updated", "record.linked"]);

export const GatewayEvent = z.strictObject({
  type: RecordEventType,
  at: IsoDateTime,
  server: ServerId,
  recordType: RecordType,
  recordId: RecordId,
  actor: z.string(),
  via: CallContext.shape.via,
  changeSetId: z.string().optional(),
  /** For record.linked: the other record. */
  targetId: RecordId.optional(),
  /** Record state after the write. */
  record: z.record(z.string(), z.unknown()),
});
export type GatewayEvent = z.infer<typeof GatewayEvent>;
