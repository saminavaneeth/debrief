import { addDays } from "@/lib/time";

/**
 * Fills server-managed fields on child items (ids, timestamps, default statuses) so callers can
 * send minimal objects, e.g. `{ title, ownerRef, dueInDays: 3 }` for a corrective action.
 */
export interface NormalizeContext {
  recordId: string;
  now: string;
  today: string;
  actor: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function nextNumber(ids: unknown[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (typeof id === "string" && id.startsWith(prefix)) {
      const n = Number(id.slice(prefix.length));
      if (Number.isInteger(n)) max = Math.max(max, n);
    }
  }
  return max + 1;
}

/** Every corrective-action list in the record, wherever it is nested. */
function correctiveActionLists(record: Obj): Obj[][] {
  const lists: Obj[][] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (isObj(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k === "correctiveActions" && Array.isArray(v)) lists.push(v as Obj[]);
        visit(v);
      }
    }
  };
  visit(record);
  return lists;
}

function normalizeCorrectiveAction(ca: Obj, id: string, ctx: NormalizeContext) {
  ca.id ??= id;
  ca.status ??= "open";
  ca.createdAt ??= ctx.now;
  ca.createdBy ??= ctx.actor;
  ca.citations ??= [];
  if (ca.dueDate === undefined && typeof ca.dueInDays === "number") {
    ca.dueDate = addDays(ctx.today, ca.dueInDays);
  }
  delete ca.dueInDays;
}

/** Mutates `record` in place. */
export function normalizeChildren(record: Obj, ctx: NormalizeContext): void {
  const lists = correctiveActionLists(record);
  const caPrefix = `${ctx.recordId}-CA`;
  let caNext = nextNumber(
    lists.flatMap((l) => l.map((ca) => ca.id)),
    caPrefix,
  );
  for (const list of lists) {
    for (const ca of list) {
      if (!isObj(ca)) continue;
      normalizeCorrectiveAction(ca, ca.id ? String(ca.id) : `${caPrefix}${caNext++}`, ctx);
    }
  }

  if (Array.isArray(record.notes)) {
    for (const note of record.notes) {
      if (!isObj(note)) continue;
      note.at ??= ctx.now;
      note.by ??= ctx.actor;
    }
  }

  if (Array.isArray(record.findings)) {
    const prefix = `${ctx.recordId}-F`;
    let n = nextNumber(
      record.findings.map((f) => (isObj(f) ? f.id : undefined)),
      prefix,
    );
    for (const f of record.findings) {
      if (!isObj(f)) continue;
      f.id ??= `${prefix}${n++}`;
      f.observedAt ??= ctx.now;
      f.status ??= "open";
      f.correctiveActions ??= [];
    }
  }

  if (Array.isArray(record.actionItems)) {
    const prefix = `${ctx.recordId}-A`;
    let n = nextNumber(
      record.actionItems.map((a) => (isObj(a) ? a.id : undefined)),
      prefix,
    );
    for (const a of record.actionItems) {
      if (!isObj(a)) continue;
      a.id ??= `${prefix}${n++}`;
      a.status ??= "open";
    }
  }

  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      if (isObj(item)) item.correctiveActions ??= [];
    }
  }
}
