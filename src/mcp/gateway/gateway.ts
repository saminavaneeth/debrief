import {
  type CallContext,
  type ChangeSet,
  type EhsRecord,
  type GatewayEvent,
  LINK_INVERSE,
  type LinkType,
  type PatchOp,
  type ProposedAction,
  type RecordRef,
  type RecordType,
  type ServerId,
} from "@/domain";
import { hashArgs } from "@/lib/hash";
import { type Clock, toOffsetIso } from "@/lib/time";
import type { AuditLog } from "./audit-log";
import type { ConnectionPool } from "./connections";
import type { Discovery } from "./discovery";
import type { EventBus } from "./event-bus";
import type { Policy } from "./policy";
import type { Registry } from "./registry";

export interface FieldError {
  path: string;
  message: string;
}

export type GatewayErrorCode =
  "not_enabled" | "forbidden" | "blocked" | "invalid" | "not_found" | "tool_error";

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly code: GatewayErrorCode,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}

export interface GatewayDeps {
  registry: Registry;
  pool: ConnectionPool;
  discovery: Discovery;
  policy: Policy;
  audit: AuditLog;
  events: EventBus;
  clock: Clock;
  utcOffset: string;
}

export interface WriteResult {
  record: EhsRecord;
  replayed: boolean;
  changes?: { path: string; before?: unknown; after?: unknown }[];
}

export interface ArtifactInfo {
  modality: "voice" | "photo" | "video" | "document" | "note";
  uri?: string;
  caption?: string;
  provenance?: unknown;
}

export interface ActionResult {
  actionId: string;
  type: ProposedAction["type"];
  status: "executed" | "failed" | "skipped";
  recordId?: string;
  error?: string;
  fieldErrors?: FieldError[];
  replayed?: boolean;
}

export interface ExecutionReport {
  changeSet: ChangeSet;
  results: ActionResult[];
}

const WRITE_TOOLS = new Set(["create_record", "update_record", "attach_evidence", "link_records"]);
const VALIDATED_TOOLS = new Set(["create_record", "update_record"]);

const refActionId = (ref: RecordRef) => ("actionId" in ref ? ref.actionId : undefined);

/** Every action's prerequisites: declared `dependsOn` plus any action it references. */
function dependenciesOf(action: ProposedAction): string[] {
  const deps = new Set(action.dependsOn);
  if (action.type === "link") {
    for (const r of [action.from, action.to]) {
      const id = refActionId(r);
      if (id) deps.add(id);
    }
  }
  if (action.type === "attach") {
    const id = refActionId(action.to);
    if (id) deps.add(id);
  }
  return [...deps];
}

/** Stable topological order; throws on unknown dependencies or cycles. */
export function orderActions(actions: ProposedAction[]): ProposedAction[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const indegree = new Map(actions.map((a) => [a.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const a of actions) {
    for (const d of dependenciesOf(a)) {
      if (!byId.has(d))
        throw new GatewayError(`Action ${a.id} depends on unknown action ${d}`, "invalid");
      indegree.set(a.id, indegree.get(a.id)! + 1);
      dependents.set(d, [...(dependents.get(d) ?? []), a.id]);
    }
  }
  const ready = actions.filter((a) => indegree.get(a.id) === 0).map((a) => a.id);
  const order: ProposedAction[] = [];
  const position = new Map(actions.map((a, i) => [a.id, i]));
  while (ready.length) {
    ready.sort((x, y) => position.get(x)! - position.get(y)!);
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const dep of dependents.get(id) ?? []) {
      indegree.set(dep, indegree.get(dep)! - 1);
      if (indegree.get(dep) === 0) ready.push(dep);
    }
  }
  if (order.length !== actions.length)
    throw new GatewayError("Change set has a dependency cycle", "invalid");
  return order;
}

/**
 * The only path for reads and writes against the EHS servers, for the agent and for workflows.
 * Writes: permission check → dry-run validation → execute with idempotency key → audit → event.
 */
export class Gateway {
  constructor(private readonly deps: GatewayDeps) {}

  get policy() {
    return this.deps.policy;
  }

  get registry() {
    return this.deps.registry;
  }

  get discovery() {
    return this.deps.discovery;
  }

  get audit() {
    return this.deps.audit;
  }

  get events() {
    return this.deps.events;
  }

  private now() {
    return toOffsetIso(this.deps.clock.now(), this.deps.utcOffset);
  }

  /* ---------------------------------------------------------------- raw calls */

  /** Call one tool on one server. Returns the tool's structured result. */
  async call<T = Record<string, unknown>>(
    server: ServerId,
    tool: string,
    args: Record<string, unknown>,
    ctx: CallContext,
  ): Promise<T> {
    const started = performance.now();
    const at = this.now();
    const name = `${server}.${tool}`;
    const base = {
      at,
      actor: ctx.actor,
      via: ctx.via,
      tool: name,
      argsHash: hashArgs(args),
      ...(ctx.changeSetId ? { changeSetId: ctx.changeSetId } : {}),
      ...(ctx.actionId ? { actionId: ctx.actionId } : {}),
      ...(typeof args.idempotencyKey === "string" ? { idempotencyKey: args.idempotencyKey } : {}),
    };
    const fail = (err: GatewayError): never => {
      this.deps.audit.append({
        ...base,
        ok: false,
        error: err.message,
        latencyMs: Math.round(performance.now() - started),
      });
      throw err;
    };

    if (!this.deps.registry.isEnabled(server)) {
      fail(new GatewayError(`Server "${server}" is not enabled`, "not_enabled"));
    }
    if (!this.deps.policy.isAllowed(ctx.roles, server, tool)) {
      fail(new GatewayError(`Roles [${ctx.roles.join(", ")}] may not call ${name}`, "forbidden"));
    }

    if (VALIDATED_TOOLS.has(tool)) {
      const check =
        tool === "create_record"
          ? { mode: "create", recordType: args.recordType, payload: args.payload }
          : { mode: "update", id: args.id, patch: args.patch };
      const verdict = await this.call<{ valid: boolean; errors: FieldError[] }>(
        server,
        "validate_record",
        check,
        ctx,
      );
      if (!verdict.valid)
        fail(
          new GatewayError(
            `Validation failed for ${name}: ${verdict.errors.map((e) => e.path || "record").join(", ")}`,
            "invalid",
            verdict.errors,
          ),
        );
    }

    const client = await this.deps.pool.client(server);
    const res = await client.callTool({ name: tool, arguments: args });
    const body = (res.structuredContent ?? {}) as Record<string, unknown>;
    if (res.isError) {
      fail(
        new GatewayError(
          String(body.error ?? `${name} failed`),
          /not found/i.test(String(body.error)) ? "not_found" : "tool_error",
          (body.fieldErrors as FieldError[]) ?? [],
        ),
      );
    }

    const record = (body.record ?? (tool === "get_record" ? body : undefined)) as
      EhsRecord | undefined;
    this.deps.audit.append({
      ...base,
      ok: true,
      ...(record?.id ? { recordId: record.id } : {}),
      latencyMs: Math.round(performance.now() - started),
    });

    if (WRITE_TOOLS.has(tool) && record && !body.replayed) {
      const event: GatewayEvent = {
        type:
          tool === "create_record"
            ? "record.created"
            : tool === "link_records"
              ? "record.linked"
              : "record.updated",
        at,
        server,
        recordType: record.recordType,
        recordId: record.id,
        actor: ctx.actor,
        via: ctx.via,
        ...(ctx.changeSetId ? { changeSetId: ctx.changeSetId } : {}),
        ...(tool === "link_records" ? { targetId: String(args.targetId) } : {}),
        record: record as unknown as Record<string, unknown>,
      };
      await this.deps.events.emit(event);
    }
    return body as T;
  }

  /* ---------------------------------------------------------------- record-level helpers */

  /** Server holding a record id, from the id prefixes in the enabled servers' manifests. */
  async serverFor(recordId: string): Promise<{ server: ServerId; recordType: RecordType }> {
    const prefix = recordId.split("-")[0];
    for (const s of await this.deps.discovery.servers()) {
      const t = s.manifest.recordTypes.find((rt) => rt.idPrefix === prefix);
      if (t) return { server: s.id, recordType: t.recordType };
    }
    throw new GatewayError(`No enabled server holds records like ${recordId}`, "not_found");
  }

  async getRecord(id: string, ctx: CallContext): Promise<EhsRecord> {
    const { server } = await this.serverFor(id);
    return this.call<EhsRecord>(server, "get_record", { id }, ctx);
  }

  async search(server: ServerId, args: Record<string, unknown>, ctx: CallContext) {
    return this.call<{ total: number; results: Record<string, unknown>[] }>(
      server,
      "search_records",
      args,
      ctx,
    );
  }

  async create(
    server: ServerId,
    recordType: RecordType,
    payload: Record<string, unknown>,
    ctx: CallContext,
    idempotencyKey: string,
  ) {
    return this.call<WriteResult>(
      server,
      "create_record",
      {
        recordType,
        payload,
        idempotencyKey,
        actor: ctx.actor,
        ...(ctx.changeSetId ? { changeSetId: ctx.changeSetId } : {}),
      },
      ctx,
    );
  }

  async update(
    id: string,
    patch: PatchOp[],
    ctx: CallContext,
    idempotencyKey: string,
    summary?: string,
  ) {
    const { server } = await this.serverFor(id);
    return this.call<WriteResult>(
      server,
      "update_record",
      {
        id,
        patch,
        idempotencyKey,
        actor: ctx.actor,
        ...(summary ? { summary } : {}),
        ...(ctx.changeSetId ? { changeSetId: ctx.changeSetId } : {}),
      },
      ctx,
    );
  }

  async attach(
    recordId: string,
    artifactId: string,
    artifact: ArtifactInfo,
    ctx: CallContext,
    idempotencyKey: string,
  ) {
    const { server } = await this.serverFor(recordId);
    return this.call<WriteResult>(
      server,
      "attach_evidence",
      {
        recordId,
        artifactId,
        ...artifact,
        idempotencyKey,
        actor: ctx.actor,
        ...(ctx.changeSetId ? { changeSetId: ctx.changeSetId } : {}),
      },
      ctx,
    );
  }

  /**
   * Link two records, possibly on different servers. Each server writes its own side: the
   * forward link on `fromId`, the inverse (see `LINK_INVERSE`) on `toId`.
   */
  async link(
    input: {
      fromId: string;
      toId: string;
      linkType: LinkType;
      fromItemId?: string;
      toItemId?: string;
    },
    ctx: CallContext,
    idempotencyKey: string,
  ): Promise<{ from: WriteResult; to: WriteResult }> {
    const fromServer = (await this.serverFor(input.fromId)).server;
    const toServer = (await this.serverFor(input.toId)).server;
    await this.getRecord(input.toId, ctx); // target must exist before writing either side
    const common = {
      actor: ctx.actor,
      ...(ctx.changeSetId ? { changeSetId: ctx.changeSetId } : {}),
    };
    const from = await this.call<WriteResult>(
      fromServer,
      "link_records",
      {
        recordId: input.fromId,
        targetId: input.toId,
        linkType: input.linkType,
        ...(input.fromItemId ? { itemId: input.fromItemId } : {}),
        ...(input.toItemId ? { targetItemId: input.toItemId } : {}),
        idempotencyKey,
        ...common,
      },
      ctx,
    );
    const to = await this.call<WriteResult>(
      toServer,
      "link_records",
      {
        recordId: input.toId,
        targetId: input.fromId,
        linkType: LINK_INVERSE[input.linkType],
        ...(input.toItemId ? { itemId: input.toItemId } : {}),
        ...(input.fromItemId ? { targetItemId: input.fromItemId } : {}),
        idempotencyKey: `${idempotencyKey}:inverse`,
        ...common,
      },
      ctx,
    );
    return { from, to };
  }

  /* ---------------------------------------------------------------- change sets */

  /**
   * Execute a change set in dependency order. Independent actions continue when one fails;
   * dependents of a failed or skipped action are not run. Re-running the same change set
   * retries only what did not execute, and idempotency keys (`changeSetId:actionId`) make
   * retried writes safe.
   */
  async executeChangeSet(
    changeSet: ChangeSet,
    ctx: Omit<CallContext, "changeSetId" | "actionId">,
    options: { artifacts?: Record<string, ArtifactInfo> } = {},
  ): Promise<ExecutionReport> {
    // Record events are delivered (to workflows) once the whole change set has been applied.
    return this.deps.events.batch(() => this.runChangeSet(changeSet, ctx, options));
  }

  private async runChangeSet(
    changeSet: ChangeSet,
    ctx: Omit<CallContext, "changeSetId" | "actionId">,
    options: { artifacts?: Record<string, ArtifactInfo> },
  ): Promise<ExecutionReport> {
    const cs = structuredClone(changeSet);
    const ordered = orderActions(cs.actions);
    const results = new Map<string, ActionResult>();
    const createdBy = new Map(cs.actions.filter((a) => a.type === "create").map((a) => [a.id, a]));
    const recordIdOf = (ref: RecordRef): string | undefined => {
      if ("id" in ref) return ref.id;
      const target = cs.actions.find((a) => a.id === ref.actionId);
      return target?.resultRecordId;
    };
    const describeTarget = async (ref: RecordRef) => {
      if ("id" in ref) return { ...(await this.serverFor(ref.id)), target: "existing" as const };
      const create = createdBy.get(ref.actionId);
      if (!create || create.type !== "create") {
        throw new GatewayError(
          `Reference to ${ref.actionId}, which is not a create action`,
          "invalid",
        );
      }
      return { server: create.server, recordType: create.recordType, target: "new" as const };
    };

    for (const action of ordered) {
      const actx: CallContext = { ...ctx, changeSetId: cs.id, actionId: action.id };
      const key = `${cs.id}:${action.id}`;
      const record = (r: ActionResult) => results.set(action.id, r);

      if (action.status === "executed") {
        record({
          actionId: action.id,
          type: action.type,
          status: "executed",
          recordId: action.resultRecordId,
          replayed: true,
        });
        continue;
      }
      if (action.status === "rejected") {
        record({
          actionId: action.id,
          type: action.type,
          status: "skipped",
          error: "Rejected in review",
        });
        continue;
      }
      const blocker = dependenciesOf(action)
        .map((d) => results.get(d)!)
        .find((r) => r.status !== "executed");
      if (blocker) {
        const failed = blocker.status === "failed";
        if (failed) {
          action.status = "failed";
          action.error = `Depends on ${blocker.actionId}, which failed`;
        }
        record({
          actionId: action.id,
          type: action.type,
          status: failed ? "failed" : "skipped",
          error: failed ? action.error : `Waiting on ${blocker.actionId}`,
        });
        continue;
      }

      try {
        const policyTarget =
          action.type === "create"
            ? { server: action.server, recordType: action.recordType, target: "new" as const }
            : action.type === "update"
              ? {
                  server: action.server,
                  recordType: action.recordType,
                  target: "existing" as const,
                }
              : await describeTarget(action.type === "link" ? action.from : action.to);
        const { level } = this.deps.policy.autonomyFor({ action: action.type, ...policyTarget });
        if (level === "blocked")
          throw new GatewayError(
            `Policy blocks ${action.type} on ${policyTarget.server}`,
            "blocked",
          );
        if (level === "approve" && action.status !== "approved") {
          record({
            actionId: action.id,
            type: action.type,
            status: "skipped",
            error: "Awaiting approval",
          });
          continue;
        }

        action.status = "executing";
        let recordId: string;
        let replayed = false;
        switch (action.type) {
          case "create": {
            const res = await this.create(
              action.server,
              action.recordType,
              action.payload,
              actx,
              key,
            );
            recordId = res.record.id;
            replayed = res.replayed;
            break;
          }
          case "update": {
            const res = await this.update(action.targetId, action.patch, actx, key);
            recordId = res.record.id;
            replayed = res.replayed;
            break;
          }
          case "link": {
            const fromId = recordIdOf(action.from)!;
            const toId = recordIdOf(action.to)!;
            const res = await this.link(
              {
                fromId,
                toId,
                linkType: action.linkType,
                fromItemId: action.fromItemId,
                toItemId: action.toItemId,
              },
              actx,
              key,
            );
            recordId = res.from.record.id;
            replayed = res.from.replayed && res.to.replayed;
            break;
          }
          case "attach": {
            const artifact = options.artifacts?.[action.artifactId];
            if (!artifact)
              throw new GatewayError(`Unknown artifact ${action.artifactId}`, "invalid");
            const res = await this.attach(
              recordIdOf(action.to)!,
              action.artifactId,
              artifact,
              actx,
              key,
            );
            recordId = res.record.id;
            replayed = res.replayed;
            break;
          }
        }
        action.status = "executed";
        action.resultRecordId = recordId as never;
        delete action.error;
        record({ actionId: action.id, type: action.type, status: "executed", recordId, replayed });
      } catch (err) {
        const ge = err instanceof GatewayError ? err : new GatewayError(String(err), "tool_error");
        action.status = "failed";
        action.error = ge.message;
        record({
          actionId: action.id,
          type: action.type,
          status: "failed",
          error: ge.message,
          ...(ge.fieldErrors.length ? { fieldErrors: ge.fieldErrors } : {}),
        });
      }
    }

    const all = cs.actions.map((a) => results.get(a.id)!);
    const relevant = all.filter((r) => r.error !== "Rejected in review");
    const executed = relevant.filter((r) => r.status === "executed").length;
    cs.status =
      executed === relevant.length ? "pushed" : executed > 0 ? "partially_pushed" : "in_review";
    return { changeSet: cs, results: all };
  }
}
