import { AsyncLocalStorage } from "node:async_hooks";
import type {
  CallContext,
  EhsRecord,
  GatewayEvent,
  RecordType,
  WorkflowAction,
  WorkflowRule,
  WorkflowRunEntry,
} from "@/domain";
import { allHold } from "@/lib/conditions";
import type { OrgDirectory } from "@/lib/org";
import { type Clock, toOffsetDate, toOffsetIso } from "@/lib/time";
import type { EventBus, Gateway } from "@/mcp/gateway";
import { getPath } from "@/mcp/servers/core/patch";
import type { WorkflowFeed } from "./feed";
import { render } from "./templates";

const MAX_DEPTH = 4;

/** Search filters the servers support, by field name, for aggregate group-by. */
const GROUP_FILTERS: Record<string, string> = {
  areaId: "areaId",
  siteId: "siteId",
  assetIds: "assetId",
  status: "status",
};

export interface EngineDeps {
  gateway: Gateway;
  org: OrgDirectory;
  clock: Clock;
  feed: WorkflowFeed;
}

type Outcome = WorkflowRunEntry["actions"][number];

/**
 * Event-driven workflow rules. Every rule action goes through the gateway as `workflow:<rule id>`,
 * so it is permissioned and audited like agent actions. Rules read the current record from the
 * gateway (not the event snapshot), and every evaluation is logged with the change set that
 * started the chain.
 */
export class WorkflowEngine {
  private rules = new Map<string, WorkflowRule>();
  private defaults = new Map<string, boolean>();
  private chain = new AsyncLocalStorage<{ changeSetId?: string; depth: number }>();

  constructor(
    private readonly deps: EngineDeps,
    rules: WorkflowRule[],
  ) {
    for (const r of rules) {
      this.rules.set(r.id, structuredClone(r));
      this.defaults.set(r.id, r.enabled);
    }
  }

  attach(events: EventBus) {
    return events.on((e) => this.handle(e));
  }

  list(): WorkflowRule[] {
    return [...this.rules.values()].map((r) => structuredClone(r));
  }

  has(id: string) {
    return this.rules.has(id);
  }

  add(rule: WorkflowRule) {
    this.rules.set(rule.id, structuredClone(rule));
  }

  setEnabled(id: string, enabled: boolean) {
    const r = this.rules.get(id);
    if (!r) throw new Error(`Unknown rule ${id}`);
    r.enabled = enabled;
  }

  /** Back to the rules on disk with their original enabled flags. */
  reset() {
    for (const id of [...this.rules.keys()]) {
      if (!this.defaults.has(id)) this.rules.delete(id);
      else this.rules.get(id)!.enabled = this.defaults.get(id)!;
    }
  }

  private now() {
    return toOffsetIso(this.deps.clock.now(), this.deps.org.utcOffset);
  }

  private matches(rule: WorkflowRule, e: GatewayEvent) {
    const events = [rule.trigger.event].flat();
    return (
      rule.enabled &&
      events.includes(e.type) &&
      (!rule.trigger.server || rule.trigger.server === e.server) &&
      (!rule.trigger.recordType || rule.trigger.recordType === e.recordType)
    );
  }

  async handle(event: GatewayEvent): Promise<void> {
    const parent = this.chain.getStore();
    const depth = (parent?.depth ?? 0) + 1;
    if (depth > MAX_DEPTH) return;
    const changeSetId = parent?.changeSetId ?? event.changeSetId;
    for (const rule of this.rules.values()) {
      if (!this.matches(rule, event)) continue;
      await this.chain.run({ changeSetId, depth }, () => this.evaluate(rule, event, changeSetId));
    }
  }

  private ctxFor(rule: WorkflowRule): CallContext {
    return { actor: `workflow:${rule.id}`, roles: ["workflow"], via: "workflow" };
  }

  private log(
    rule: WorkflowRule,
    event: GatewayEvent,
    changeSetId: string | undefined,
    fired: boolean,
    reason: string,
    actions: Outcome[] = [],
  ) {
    this.deps.feed.log({
      at: this.now(),
      ruleId: rule.id,
      ruleName: rule.name,
      event: event.type,
      recordId: event.recordId,
      ...(changeSetId ? { changeSetId } : {}),
      fired,
      reason,
      actions,
    });
  }

  private async evaluate(rule: WorkflowRule, event: GatewayEvent, changeSetId: string | undefined) {
    const ctx = this.ctxFor(rule);
    let record: EhsRecord;
    try {
      record = await this.deps.gateway.getRecord(event.recordId, ctx);
    } catch (err) {
      this.log(
        rule,
        event,
        changeSetId,
        false,
        `Could not read ${event.recordId}: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }
    if (!allHold(rule.conditions, record)) {
      this.log(rule, event, changeSetId, false, "Conditions not met");
      return;
    }

    const base: Record<string, unknown> = {
      ...record,
      area: this.deps.org.areaName(record.areaId) ?? record.areaId ?? "",
      now: this.now(),
      today: toOffsetDate(this.deps.clock.now(), this.deps.org.utcOffset),
    };
    let dedupeKey = `${rule.id}:${record.id}`;

    if (rule.aggregate) {
      const a = rule.aggregate;
      const group = getPath(record, a.groupBy);
      const groupValue = Array.isArray(group) ? group[0] : group;
      if (groupValue === undefined) {
        this.log(rule, event, changeSetId, false, `No ${a.groupBy} to group by`);
        return;
      }
      const days = Number(a.window.replace("d", ""));
      const since = toOffsetIso(
        new Date(this.deps.clock.now().getTime() - days * 86_400_000),
        this.deps.org.utcOffset,
      );
      const filter = GROUP_FILTERS[a.groupBy];
      const args: Record<string, unknown> = {
        recordType: record.recordType,
        limit: 100,
        ...(filter ? { [filter]: groupValue } : {}),
      };
      if (a.activity === "created_or_updated") args.updatedSince = since;
      else args.from = since;
      const found = await this.deps.gateway.search(record.server, args, ctx);
      const ids = found.results.map((r) => String(r.id));
      const n = ids.length;
      const ok =
        a.count.op === "gte"
          ? n >= a.count.value
          : a.count.op === "gt"
            ? n > a.count.value
            : n === a.count.value;
      if (!ok) {
        this.log(
          rule,
          event,
          changeSetId,
          false,
          `${n} ${record.recordType.replaceAll("_", " ")}(s) in ${a.groupBy === "areaId" ? (this.deps.org.areaName(String(groupValue)) ?? groupValue) : `${a.groupBy} ${groupValue}`} within ${a.window} (needs ${a.count.op === "gte" ? "at least" : a.count.op} ${a.count.value})`,
        );
        return;
      }
      base.count = n;
      base.recordIds = ids;
      base.group = groupValue;
      dedupeKey = `${rule.id}:${String(groupValue)}`;
    }
    if (
      rule.actions.every((x) => x.type === "suggest") &&
      this.deps.feed.hasOpenSuggestion(dedupeKey)
    ) {
      this.log(rule, event, changeSetId, false, "Already suggested");
      return;
    }

    // Per child item, or once for the record.
    const items: (Record<string, unknown> | undefined)[] = [];
    if (rule.forEach) {
      const list = getPath(record, rule.forEach.path);
      const candidates = (Array.isArray(list) ? list : []).filter((i) =>
        allHold(rule.forEach!.where, i),
      ) as Record<string, unknown>[];
      const skipped: string[] = [];
      for (const item of candidates) {
        if (
          rule.forEach.unlessLinked &&
          (await this.itemLinkedTo(record, String(item.id), rule.forEach.unlessLinked))
        )
          skipped.push(String(item.id));
        else items.push(item);
      }
      if (items.length === 0) {
        this.log(
          rule,
          event,
          changeSetId,
          false,
          candidates.length
            ? `Every matching item already has a linked ${rule.forEach.unlessLinked} (${skipped.join(", ")})`
            : "No matching items",
        );
        return;
      }
    } else items.push(undefined);

    const outcomes: Outcome[] = [];
    for (const item of items) {
      const scope = item ? { ...base, item } : base;
      for (const [i, action] of rule.actions.entries()) {
        const key = `wf:${rule.id}:${record.id}:${item ? String(item.id) : "-"}:${i}:${changeSetId ?? record.updatedAt}`;
        outcomes.push(
          await this.run(rule, action, record, scope, key, item, changeSetId, dedupeKey),
        );
      }
    }
    const fired = outcomes.some((o) => o.ok);
    this.log(
      rule,
      event,
      changeSetId,
      fired,
      fired ? `${outcomes.filter((o) => o.ok).length} action(s) done` : "All actions failed",
      outcomes,
    );
  }

  private async itemLinkedTo(record: EhsRecord, itemId: string, recordType: RecordType) {
    for (const l of record.links) {
      if (l.itemId !== itemId) continue;
      try {
        const { recordType: t } = await this.deps.gateway.serverFor(l.targetId);
        if (t === recordType) return true;
      } catch {
        // Target on a disconnected server: not counted.
      }
    }
    return false;
  }

  private async run(
    rule: WorkflowRule,
    action: WorkflowAction,
    record: EhsRecord,
    scope: Record<string, unknown>,
    key: string,
    item: Record<string, unknown> | undefined,
    changeSetId: string | undefined,
    dedupeKey: string,
  ): Promise<Outcome> {
    const { gateway, org, feed } = this.deps;
    const ctx = this.ctxFor(rule);
    const target = (ref: string) => (ref === "trigger" ? record.id : ref);
    try {
      switch (action.type) {
        case "notify": {
          const recipients = action.to.startsWith("role:")
            ? org.peopleWithRole(action.to.slice(5))
            : [action.to];
          const text = String(render(action.template, scope));
          feed.notify({
            at: this.now(),
            ruleId: rule.id,
            ruleName: rule.name,
            to: action.to,
            recipients,
            text,
            recordId: record.id,
            ...(changeSetId ? { changeSetId } : {}),
          });
          return {
            type: "notify",
            ok: true,
            detail: `${text} → ${recipients.length} recipient(s)`,
          };
        }
        case "suggest": {
          const s = feed.suggest({
            at: this.now(),
            ruleId: rule.id,
            ruleName: rule.name,
            title: String(render(action.title, scope)),
            text: String(render(action.template, scope)),
            recordIds: (scope.recordIds as string[] | undefined) ?? [record.id],
            ...(action.proposal
              ? { proposal: render(action.proposal, scope) as Record<string, unknown> }
              : {}),
            key: dedupeKey,
            ...(changeSetId ? { changeSetId } : {}),
          });
          return s
            ? { type: "suggest", ok: true, detail: s.title }
            : { type: "suggest", ok: false, error: "Already suggested" };
        }
        case "update_record": {
          const res = await gateway.update(
            target(action.target),
            render(action.patch, scope) as never,
            ctx,
            key,
            `Workflow: ${rule.name}`,
          );
          return { type: "update_record", ok: true, recordId: res.record.id };
        }
        case "create_record": {
          const payload = render(action.payload, scope) as Record<string, unknown>;
          const res = await gateway.create(action.server, action.recordType, payload, ctx, key);
          if (action.linkToTrigger) {
            await gateway.link(
              {
                fromId: res.record.id,
                toId: record.id,
                linkType: action.linkToTrigger.type,
                ...(item ? { toItemId: String(item.id) } : {}),
              },
              ctx,
              `${key}:link`,
            );
          }
          return {
            type: "create_record",
            ok: true,
            recordId: res.record.id,
            detail: res.record.title,
          };
        }
        case "link_records": {
          await gateway.link(
            { fromId: target(action.from), toId: target(action.to), linkType: action.linkType },
            ctx,
            key,
          );
          return { type: "link_records", ok: true };
        }
      }
    } catch (err) {
      return {
        type: action.type,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Did a rule act on records touched by this change set? */
  fired(ruleId: string, changeSetId: string): boolean {
    return this.deps.feed.runs.some(
      (r) => r.ruleId === ruleId && r.changeSetId === changeSetId && r.fired,
    );
  }
}
