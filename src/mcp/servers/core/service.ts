import MiniSearch from "minisearch";
import { z } from "zod";
import {
  AttachedEvidence,
  type EhsRecord,
  LinkType,
  PatchOp,
  Provenance,
  RECORD_SCHEMAS,
  type RecordType,
} from "@/domain";
import { hashArgs } from "@/lib/hash";
import { type Clock, toOffsetDate, toOffsetIso } from "@/lib/time";
import type { RecordRepository } from "../../store/repository";
import type { ModuleDefinition } from "./module";
import { normalizeChildren } from "./normalize";
import { applyPatch, findIndex, PatchError } from "./patch";
import {
  createPayloadSchema,
  type FieldError,
  type ReferenceData,
  SERVER_MANAGED_FIELDS,
  validateRecord,
} from "./validation";

export class ToolError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}

export interface ServerDeps {
  store: RecordRepository;
  refs: ReferenceData;
  clock: Clock;
}

/* ------------------------------------------------------------------ tool argument schemas */

const Actor = z
  .string()
  .default("system")
  .describe("Person id (P-001), agent, workflow:<id> or system. Recorded in history.");
const WriteMeta = {
  idempotencyKey: z
    .string()
    .min(1)
    .describe("Unique per logical write; retries with the same key return the first result."),
  actor: Actor,
  changeSetId: z.string().optional(),
};

export const SearchArgs = z.object({
  query: z
    .string()
    .optional()
    .describe("Free text over title, description, notes and child items."),
  recordType: z.string().optional(),
  siteId: z.string().optional(),
  areaId: z.string().optional(),
  assetId: z
    .string()
    .optional()
    .describe("Matches assetIds or child items (e.g. inspection items)."),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  from: z.string().optional().describe("Earliest event date/time (ISO), inclusive."),
  to: z.string().optional().describe("Latest event date/time (ISO), inclusive."),
  updatedSince: z.string().optional().describe("Only records updated at or after this time."),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});
export const GetArgs = z.object({ id: z.string() });
export const CreateArgs = z.object({
  recordType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  ...WriteMeta,
});
export const UpdateArgs = z.object({
  id: z.string(),
  patch: z.array(PatchOp).min(1),
  summary: z.string().optional().describe("History summary; generated when omitted."),
  ...WriteMeta,
});
export const AttachArgs = z.object({
  recordId: z.string(),
  artifactId: z.string(),
  modality: AttachedEvidence.shape.modality,
  uri: z.string().optional(),
  caption: z.string().optional(),
  provenance: Provenance.optional(),
  ...WriteMeta,
});
export const LinkArgs = z.object({
  recordId: z.string().describe("Record on this server that gets the link."),
  targetId: z.string().describe("Record the link points at (may be on another server)."),
  linkType: LinkType,
  itemId: z.string().optional().describe("Child item on this record the link starts from."),
  targetItemId: z.string().optional().describe("Child item on the target record."),
  ...WriteMeta,
});
export const ValidateArgs = z.object({
  mode: z.enum(["create", "update"]),
  recordType: z.string().optional().describe("Required for mode=create."),
  payload: z.record(z.string(), z.unknown()).optional().describe("Required for mode=create."),
  id: z.string().optional().describe("Required for mode=update."),
  patch: z.array(PatchOp).optional().describe("Required for mode=update."),
});

export interface SearchHit {
  id: string;
  recordType: RecordType;
  title: string;
  status: string;
  siteId: string;
  areaId?: string;
  assetIds: string[];
  /** Hazard taxonomy category, for record types that have one. */
  category?: string;
  /** First 200 characters of the description. */
  summary: string;
  eventAt: string;
  updatedAt: string;
  score: number;
}

export interface WriteResult {
  record: EhsRecord;
  replayed: boolean;
  changes?: { path: string; before?: unknown; after?: unknown }[];
}

/** When a record "happened", for date-range filters and sorting. */
export function eventTime(r: EhsRecord): string {
  const any = r as unknown as Record<string, unknown>;
  for (const key of ["occurredAt", "observedAt", "identifiedAt", "heldAt", "completedAt"]) {
    if (typeof any[key] === "string") return any[key] as string;
  }
  if (typeof any.scheduledDate === "string") return `${any.scheduledDate}T00:00:00Z`;
  return r.createdAt;
}

function searchText(r: EhsRecord): string {
  const any = r as unknown as Record<string, unknown>;
  const parts: string[] = [
    ...r.notes.map((n) => n.text),
    ...r.correctiveActions.map((c) => c.title),
  ];
  for (const key of ["findings", "items", "actionItems"]) {
    const list = any[key];
    if (Array.isArray(list)) {
      for (const el of list as Record<string, unknown>[]) {
        for (const f of ["title", "label", "description", "notes"]) {
          if (typeof el[f] === "string") parts.push(el[f] as string);
        }
      }
    }
  }
  for (const key of ["topic", "scope", "personObserved", "course", "reason"]) {
    if (typeof any[key] === "string") parts.push(any[key] as string);
  }
  return parts.join(" ");
}

/**
 * The behaviour of one mock EHS server. Each method is one MCP tool; `create-server.ts` exposes
 * them over the protocol.
 */
export class ModuleService {
  readonly server: string;
  private readonly recordTypes: Set<string>;

  constructor(
    readonly def: ModuleDefinition,
    private readonly deps: ServerDeps,
  ) {
    this.server = def.manifest.server;
    this.recordTypes = new Set(def.manifest.recordTypes.map((t) => t.recordType));
  }

  private nowIso() {
    return toOffsetIso(this.deps.clock.now(), this.deps.refs.org.utcOffset);
  }

  private today() {
    return toOffsetDate(this.deps.clock.now(), this.deps.refs.org.utcOffset);
  }

  private assertRecordType(recordType: string): asserts recordType is RecordType {
    if (!this.recordTypes.has(recordType)) {
      throw new ToolError(
        `Server "${this.server}" does not hold record type "${recordType}". ` +
          `Available: ${[...this.recordTypes].join(", ")}`,
      );
    }
  }

  private async getOwn(id: string): Promise<EhsRecord> {
    const record = await this.deps.store.get(id);
    if (!record || record.server !== this.server) {
      throw new ToolError(`Record ${id} not found on server "${this.server}"`);
    }
    return record;
  }

  /** Runs a write once per idempotency key; a retry with the same arguments returns the result. */
  private async once(
    tool: string,
    args: { idempotencyKey: string } & Record<string, unknown>,
    run: () => Promise<WriteResult>,
  ): Promise<WriteResult> {
    const argsHash = hashArgs({ tool, ...args });
    const prior = await this.deps.store.getIdempotency(this.server as never, args.idempotencyKey);
    if (prior) {
      if (prior.argsHash !== argsHash || prior.tool !== tool) {
        throw new ToolError(
          `Idempotency key "${args.idempotencyKey}" was already used with different arguments`,
        );
      }
      return { ...(prior.result as WriteResult), replayed: true };
    }
    const result = await run();
    await this.deps.store.putIdempotency({
      key: args.idempotencyKey,
      server: this.server as never,
      tool,
      argsHash,
      result,
      at: this.nowIso(),
    });
    return result;
  }

  private check(record: unknown): EhsRecord {
    const result = validateRecord(record, this.deps.refs);
    if (!result.ok) throw new ToolError("Record failed validation", result.errors);
    return result.record;
  }

  /* ---------------------------------------------------------------- read */

  async search(
    input: z.input<typeof SearchArgs>,
  ): Promise<{ total: number; results: SearchHit[] }> {
    const args = SearchArgs.parse(input);
    if (args.recordType) this.assertRecordType(args.recordType);
    const statuses = args.status === undefined ? undefined : [args.status].flat();

    let records = (await this.deps.store.list({ server: this.server as never })).filter((r) => {
      const any = r as unknown as Record<string, unknown>;
      if (args.recordType && r.recordType !== args.recordType) return false;
      if (args.siteId && r.siteId !== args.siteId) return false;
      if (args.areaId && r.areaId !== args.areaId) return false;
      if (statuses && !statuses.includes(r.status)) return false;
      if (args.assetId) {
        const items = Array.isArray(any.items) ? (any.items as { assetId?: string }[]) : [];
        if (!r.assetIds.includes(args.assetId) && !items.some((i) => i.assetId === args.assetId)) {
          return false;
        }
      }
      const at = Date.parse(eventTime(r));
      if (args.from && at < Date.parse(args.from)) return false;
      if (args.to && at > Date.parse(args.to)) return false;
      if (args.updatedSince && Date.parse(r.updatedAt) < Date.parse(args.updatedSince))
        return false;
      return true;
    });

    const scores = new Map<string, number>();
    if (args.query?.trim()) {
      const index = new MiniSearch({
        fields: ["id", "title", "description", "text", "assets"],
        idField: "id",
        searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2, assets: 2 } },
      });
      index.addAll(
        records.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          text: searchText(r),
          assets: r.assetIds.join(" "),
        })),
      );
      for (const hit of index.search(args.query, { combineWith: "OR" })) {
        scores.set(String(hit.id), hit.score);
      }
      records = records.filter((r) => scores.has(r.id));
      records.sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || a.id.localeCompare(b.id));
    } else {
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    }

    return {
      total: records.length,
      results: records.slice(args.offset, args.offset + args.limit).map((r) => ({
        id: r.id,
        recordType: r.recordType,
        title: r.title,
        status: r.status,
        siteId: r.siteId,
        ...(r.areaId ? { areaId: r.areaId } : {}),
        assetIds: r.assetIds,
        ...(typeof (r as { category?: unknown }).category === "string"
          ? { category: (r as { category: string }).category }
          : {}),
        summary: r.description.slice(0, 200),
        eventAt: eventTime(r),
        updatedAt: r.updatedAt,
        score: Number((scores.get(r.id) ?? 0).toFixed(4)),
      })),
    };
  }

  async get(input: z.input<typeof GetArgs>): Promise<EhsRecord> {
    return this.getOwn(GetArgs.parse(input).id);
  }

  /* ---------------------------------------------------------------- build helpers */

  private async buildNew(
    recordType: string,
    payload: Record<string, unknown>,
    actor: string,
    changeSetId: string | undefined,
    id?: string,
  ): Promise<EhsRecord> {
    this.assertRecordType(recordType);
    const managed = SERVER_MANAGED_FIELDS.filter((k) => k in payload);
    if (managed.length) {
      throw new ToolError(
        "Payload contains server-managed fields",
        managed.map((path) => ({ path, message: "Set by the server" })),
      );
    }
    const now = this.nowIso();
    const recordId = id ?? (await this.deps.store.nextId(recordType));
    const initial = this.def.initialStatus[recordType];
    const shaped = createPayloadSchema(recordType, initial ?? "open").safeParse(payload);
    if (!shaped.success) {
      throw new ToolError(
        "Payload failed validation",
        shaped.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    const record: Record<string, unknown> = {
      ...structuredClone(payload),
      id: recordId,
      server: this.server,
      recordType,
      status: payload.status ?? initial,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      links: [],
      evidence: [],
      history: [
        {
          at: now,
          by: actor,
          action: "created",
          summary: "Record created",
          ...(changeSetId ? { changeSetId } : {}),
          changes: [],
        },
      ],
    };
    normalizeChildren(record, { recordId, now, today: this.today(), actor });
    return this.check(record);
  }

  private buildUpdate(
    record: EhsRecord,
    patch: z.infer<typeof PatchOp>[],
    actor: string,
    changeSetId: string | undefined,
    summary: string | undefined,
  ) {
    let applied;
    try {
      applied = applyPatch(record as unknown as Record<string, unknown>, patch);
    } catch (err) {
      if (err instanceof PatchError)
        throw new ToolError(err.message, [{ path: "patch", message: err.message }]);
      throw err;
    }
    const now = this.nowIso();
    const next = applied.record;
    normalizeChildren(next, { recordId: record.id, now, today: this.today(), actor });
    const statusChange = applied.changes.find((c) => c.path === "status");
    next.updatedAt = now;
    (next.history as unknown[]).push({
      at: now,
      by: actor,
      action: statusChange ? "status_changed" : "updated",
      summary:
        summary ??
        (statusChange
          ? `Status ${String(statusChange.before)} → ${String(statusChange.after)}`
          : `Updated ${applied.changes.map((c) => c.path).join(", ")}`),
      ...(changeSetId ? { changeSetId } : {}),
      changes: applied.changes.map((c) => ({ path: c.path, before: c.before, after: c.after })),
    });
    return { record: this.check(next), changes: applied.changes };
  }

  /* ---------------------------------------------------------------- write */

  async create(input: z.input<typeof CreateArgs>): Promise<WriteResult> {
    const args = CreateArgs.parse(input);
    return this.once("create_record", args, async () => {
      const record = await this.buildNew(
        args.recordType,
        args.payload,
        args.actor,
        args.changeSetId,
      );
      await this.deps.store.insert(record);
      return { record, replayed: false };
    });
  }

  async update(input: z.input<typeof UpdateArgs>): Promise<WriteResult> {
    const args = UpdateArgs.parse(input);
    return this.once("update_record", args, async () => {
      const current = await this.getOwn(args.id);
      const { record, changes } = this.buildUpdate(
        current,
        args.patch,
        args.actor,
        args.changeSetId,
        args.summary,
      );
      await this.deps.store.replace(record);
      return { record, replayed: false, changes };
    });
  }

  async attach(input: z.input<typeof AttachArgs>): Promise<WriteResult> {
    const args = AttachArgs.parse(input);
    return this.once("attach_evidence", args, async () => {
      const record = await this.getOwn(args.recordId);
      if (record.evidence.some((e) => e.artifactId === args.artifactId)) {
        return { record, replayed: false };
      }
      const now = this.nowIso();
      record.evidence.push({
        artifactId: args.artifactId,
        modality: args.modality,
        ...(args.uri ? { uri: args.uri } : {}),
        ...(args.caption ? { caption: args.caption } : {}),
        ...(args.provenance ? { provenance: args.provenance } : {}),
        attachedAt: now,
        attachedBy: args.actor,
      });
      record.updatedAt = now;
      record.history.push({
        at: now,
        by: args.actor,
        action: "attached",
        summary: `Attached ${args.modality} ${args.artifactId}`,
        ...(args.changeSetId ? { changeSetId: args.changeSetId } : {}),
        changes: [],
      });
      const checked = this.check(record);
      await this.deps.store.replace(checked);
      return { record: checked, replayed: false };
    });
  }

  async link(input: z.input<typeof LinkArgs>): Promise<WriteResult> {
    const args = LinkArgs.parse(input);
    return this.once("link_records", args, async () => {
      if (!this.def.manifest.linkTypes.includes(args.linkType)) {
        throw new ToolError(`Link type "${args.linkType}" is not supported by "${this.server}"`);
      }
      const record = await this.getOwn(args.recordId);
      if (args.targetId === record.id) throw new ToolError("A record cannot link to itself");
      if (args.itemId) {
        const manifestType = this.def.manifest.recordTypes.find(
          (t) => t.recordType === record.recordType,
        )!;
        const any = record as unknown as Record<string, unknown>;
        const found = manifestType.childCollections.some((c) => {
          const list = any[c];
          return Array.isArray(list) && findIndex(list, args.itemId!) !== -1;
        });
        if (!found) throw new ToolError(`No child item "${args.itemId}" on ${record.id}`);
      }
      const exists = record.links.some(
        (l) =>
          l.targetId === args.targetId &&
          l.type === args.linkType &&
          l.itemId === args.itemId &&
          l.targetItemId === args.targetItemId,
      );
      if (exists) return { record, replayed: false };

      const now = this.nowIso();
      record.links.push({
        type: args.linkType,
        targetId: args.targetId,
        ...(args.itemId ? { itemId: args.itemId } : {}),
        ...(args.targetItemId ? { targetItemId: args.targetItemId } : {}),
        createdAt: now,
        createdBy: args.actor,
      });
      record.updatedAt = now;
      record.history.push({
        at: now,
        by: args.actor,
        action: "linked",
        summary: `${args.itemId ? `${args.itemId} ` : ""}${args.linkType} ${args.targetId}`,
        ...(args.changeSetId ? { changeSetId: args.changeSetId } : {}),
        changes: [],
      });
      const checked = this.check(record);
      await this.deps.store.replace(checked);
      return { record: checked, replayed: false };
    });
  }

  async validate(
    input: z.input<typeof ValidateArgs>,
  ): Promise<{ valid: boolean; errors: FieldError[]; preview?: EhsRecord }> {
    const args = ValidateArgs.parse(input);
    try {
      if (args.mode === "create") {
        if (!args.recordType || !args.payload) {
          throw new ToolError("mode=create needs recordType and payload");
        }
        const preview = await this.buildNew(args.recordType, args.payload, "system", undefined);
        return { valid: true, errors: [], preview };
      }
      if (!args.id || !args.patch) throw new ToolError("mode=update needs id and patch");
      const current = await this.getOwn(args.id);
      const { record } = this.buildUpdate(current, args.patch, "system", undefined, undefined);
      return { valid: true, errors: [], preview: record };
    } catch (err) {
      if (err instanceof ToolError) {
        return {
          valid: false,
          errors: err.fieldErrors.length ? err.fieldErrors : [{ path: "", message: err.message }],
        };
      }
      throw err;
    }
  }

  /* ---------------------------------------------------------------- resources */

  jsonSchema(recordType: string) {
    this.assertRecordType(recordType);
    const initial = this.def.initialStatus[recordType] ?? "open";
    const schema = z.toJSONSchema(createPayloadSchema(recordType, initial), {
      io: "input",
      unrepresentable: "any",
    });
    const meta = this.def.manifest.recordTypes.find((t) => t.recordType === recordType)!;
    return {
      ...schema,
      $id: `ehs://${this.server}/schema/${recordType}`,
      title: meta.displayName,
      description: meta.description,
      "x-recordType": recordType,
      "x-idPrefix": meta.idPrefix,
    };
  }

  picklists() {
    const shared = {
      severity: [
        { value: 1, label: "1 · Minimal" },
        { value: 2, label: "2 · Minor" },
        { value: 3, label: "3 · Moderate" },
        { value: 4, label: "4 · Serious" },
        { value: 5, label: "5 · Critical" },
      ],
      riskLevel: ["low", "medium", "high", "critical"].map((v) => ({
        value: v,
        label: v[0].toUpperCase() + v.slice(1),
      })),
      hazardCategory: [...this.deps.refs.hazardCategories].map(([value, label]) => ({
        value,
        label,
      })),
    };
    const statuses: Record<string, { value: string; label: string }[]> = {};
    for (const t of this.def.manifest.recordTypes) {
      const shape = (RECORD_SCHEMAS[t.recordType] as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const options = (shape.status as z.ZodEnum).options as string[];
      statuses[`status.${t.recordType}`] = options.map((v) => ({
        value: v,
        label: v.replaceAll("_", " "),
      }));
    }
    return { ...shared, ...statuses, ...this.def.picklists };
  }
}
