import type {
  ChangeSet,
  ExpectedAction,
  ExpectedChangeSet,
  ProposedAction,
  RecordRef,
} from "@/domain";
import { getPath } from "@/mcp/servers/core/patch";

/** Compare a produced change set with the expected one for a scenario. Used by tests and evals. */

export interface FieldCheck {
  ref: string;
  path: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
  kind: "equals" | "contains" | "includes";
}

export interface Comparison {
  scenarioId: string;
  /** Expected action ref → produced action id. */
  mapping: Record<string, string>;
  missingActions: string[];
  extraActions: string[];
  fields: FieldCheck[];
  gapsMissing: string[];
  gapsExtra: string[];
  citationsMissing: string[];
  sortMissing: string[];
  sortExtra: string[];
  forbidden: string[];
  unsupported: string[];
  routing: { expected: string[]; produced: string[] };
  ok: boolean;
}

const norm = (v: unknown): unknown => {
  if (typeof v === "string") return v.trim().toLowerCase();
  if (Array.isArray(v))
    return [...v].map(norm).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return v;
};
const equal = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

function matchesItem(item: unknown, match: string | Record<string, unknown>): boolean {
  if (typeof match === "string")
    return typeof item === "string" && item.toLowerCase().includes(match.toLowerCase());
  if (typeof item !== "object" || item === null) return false;
  return Object.entries(match).every(([k, v]) => {
    const actual = (item as Record<string, unknown>)[k];
    return typeof v === "string"
      ? typeof actual === "string" && actual.toLowerCase().includes(v.toLowerCase())
      : equal(actual, v);
  });
}

/** Values an action proposes at a path (create payload, or update `set`/`append` ops). */
function proposedValue(a: ProposedAction, path: string): unknown {
  if (a.type === "create") return getPath(a.payload, path);
  if (a.type === "update") {
    const set = a.patch.filter((p) => p.op === "set" && p.path === path).at(-1);
    if (set) return set.value;
    const appended = a.patch
      .filter((p) => p.op === "append" && p.path === path)
      .map((p) => p.value);
    if (appended.length) return appended;
  }
  return undefined;
}

function fieldScore(
  exp: Extract<ExpectedAction, { type: "create" | "update" }>,
  a: ProposedAction,
) {
  let score = 0;
  for (const [path, v] of Object.entries(exp.fields)) if (equal(proposedValue(a, path), v)) score++;
  for (const [path, v] of Object.entries(exp.fieldsContain))
    if (
      String(proposedValue(a, path) ?? "")
        .toLowerCase()
        .includes(v.toLowerCase())
    )
      score++;
  return score;
}

export function compareChangeSet(expected: ExpectedChangeSet, produced: ChangeSet): Comparison {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const missing: string[] = [];
  const fields: FieldCheck[] = [];
  const actions = produced.actions;

  // Records: creates by server/type (best field match), updates by target.
  for (const exp of expected.actions) {
    if (exp.type !== "create" && exp.type !== "update") continue;
    const candidates = actions.filter(
      (a) =>
        !used.has(a.id) &&
        a.type === exp.type &&
        a.server === exp.server &&
        a.recordType === exp.recordType &&
        (exp.type === "create" || (a.type === "update" && a.targetId === exp.targetId)),
    );
    const best = candidates.sort((x, y) => fieldScore(exp, y) - fieldScore(exp, x))[0];
    if (!best) {
      missing.push(
        `${exp.ref} ${exp.type} ${exp.server}/${exp.recordType}${exp.type === "update" ? ` ${exp.targetId}` : ""}`,
      );
      continue;
    }
    mapping[exp.ref] = best.id;
    used.add(best.id);
    for (const [path, v] of Object.entries(exp.fields)) {
      const actual = proposedValue(best, path);
      fields.push({
        ref: exp.ref,
        path,
        expected: v,
        actual,
        ok: equal(actual, v),
        kind: "equals",
      });
    }
    for (const [path, v] of Object.entries(exp.fieldsContain)) {
      const actual = proposedValue(best, path);
      fields.push({
        ref: exp.ref,
        path,
        expected: v,
        actual,
        ok: String(actual ?? "")
          .toLowerCase()
          .includes(v.toLowerCase()),
        kind: "contains",
      });
    }
    for (const inc of exp.includes) {
      const raw = proposedValue(best, inc.path);
      const list = Array.isArray(raw) ? raw.flatMap((x) => (Array.isArray(x) ? x : [x])) : [];
      fields.push({
        ref: exp.ref,
        path: inc.path,
        expected: inc.match,
        actual: list,
        ok: list.some((i) => matchesItem(i, inc.match)),
        kind: "includes",
      });
    }
  }

  const expRefKey = (r: { id: string } | { ref: string }): string => {
    if ("id" in r) return `id:${r.id}`;
    const exp = expected.actions.find((a) => a.ref === r.ref);
    if (exp?.type === "update") return `id:${exp.targetId}`;
    return `act:${mapping[r.ref] ?? `missing-${r.ref}`}`;
  };
  const refKey = (r: RecordRef) => ("id" in r ? `id:${r.id}` : `act:${r.actionId}`);

  for (const exp of expected.actions) {
    if (exp.type === "link") {
      const hit = actions.find(
        (a) =>
          !used.has(a.id) &&
          a.type === "link" &&
          a.linkType === exp.linkType &&
          refKey(a.from) === expRefKey(exp.from) &&
          refKey(a.to) === expRefKey(exp.to) &&
          (!exp.toItemId || a.toItemId === exp.toItemId),
      );
      if (hit) {
        mapping[exp.ref] = hit.id;
        used.add(hit.id);
      } else
        missing.push(
          `${exp.ref} link ${expRefKey(exp.from)} -${exp.linkType}-> ${expRefKey(exp.to)}${exp.toItemId ? ` (${exp.toItemId})` : ""}`,
        );
    }
    if (exp.type === "attach") {
      const hit = actions.find(
        (a) =>
          !used.has(a.id) &&
          a.type === "attach" &&
          a.artifactId === exp.artifactId &&
          refKey(a.to) === expRefKey(exp.to),
      );
      if (hit) {
        mapping[exp.ref] = hit.id;
        used.add(hit.id);
      } else missing.push(`${exp.ref} attach ${exp.artifactId} -> ${expRefKey(exp.to)}`);
    }
  }

  const describe = (a: ProposedAction) =>
    a.type === "create"
      ? `create ${a.server}/${a.recordType}`
      : a.type === "update"
        ? `update ${a.targetId}`
        : a.type === "link"
          ? `link ${refKey(a.from)} -${a.linkType}-> ${refKey(a.to)}`
          : `attach ${a.artifactId} -> ${refKey(a.to)}`;
  const extra = actions.filter((a) => !used.has(a.id)).map((a) => `${a.id} ${describe(a)}`);

  const gapKey = (actionId: string, path: string) => `${actionId}|${path}`;
  const producedGaps = new Set(produced.gaps.map((g) => gapKey(g.actionId, g.fieldPath)));
  const expectedGaps = new Set(
    expected.gaps.map((g) => gapKey(mapping[g.actionRef] ?? `missing-${g.actionRef}`, g.fieldPath)),
  );
  const gapsMissing = [...expectedGaps].filter((g) => !producedGaps.has(g));
  const gapsExtra = [...producedGaps].filter((g) => !expectedGaps.has(g));

  const citationsMissing: string[] = [];
  for (const c of expected.citations) {
    const a = actions.find((x) => x.id === mapping[c.actionRef]);
    const supports =
      a && (a.type === "create" || a.type === "update")
        ? Object.entries(a.fieldSupport).filter(
            ([k]) =>
              k === c.fieldPath ||
              k.startsWith(`${c.fieldPath}[`) ||
              k.startsWith(`${c.fieldPath}.`),
          )
        : [];
    if (!supports.some(([, s]) => s.citations.some((x) => x.docId === c.docId)))
      citationsMissing.push(`${c.actionRef}.${c.fieldPath} → ${c.docId}`);
  }

  const sortKey = (s: { kind: string; artifactIds: string[]; toScenarioId: string | null }) =>
    `${s.kind}:${[...s.artifactIds].sort().join(",")}->${s.toScenarioId}`;
  const prodSort = new Set(produced.sortSuggestions.map(sortKey));
  const expSort = new Set(expected.sortSuggestions.map(sortKey));
  const sortMissing = [...expSort].filter((s) => !prodSort.has(s));
  const sortExtra = [...prodSort].filter((s) => !expSort.has(s));

  const forbidden: string[] = [];
  for (const f of expected.forbidden) {
    const n = actions.filter(
      (a) => a.type === "create" && a.server === f.server && a.recordType === f.recordType,
    ).length;
    if (n > f.maxCreates)
      forbidden.push(`${n} ${f.recordType} creates (max ${f.maxCreates}): ${f.reason}`);
  }

  const unsupported: string[] = [];
  for (const a of actions) {
    if (a.type === "create") {
      for (const key of Object.keys(a.payload)) {
        const s = a.fieldSupport[key];
        if (
          !s ||
          (s.evidenceIds.length === 0 &&
            !s.rule &&
            s.source !== "user" &&
            s.source !== "schema_default")
        )
          unsupported.push(`${a.id}.${key}`);
      }
    }
    if (a.type === "update") {
      for (const p of a.patch) {
        const ok = Object.entries(a.fieldSupport).some(
          ([k, s]) =>
            (k === p.path || k.startsWith(`${p.path}[`)) && (s.evidenceIds.length > 0 || !!s.rule),
        );
        if (!ok) unsupported.push(`${a.id}.${p.path}`);
      }
    }
  }

  const routeKey = (a: { type: string; server?: string; recordType?: string }) =>
    `${a.server}/${a.recordType}`;
  const routing = {
    expected: [
      ...new Set(
        expected.actions
          .filter((a) => a.type === "create" || a.type === "update")
          .map((a) => routeKey(a as never)),
      ),
    ].sort(),
    produced: [
      ...new Set(
        actions
          .filter((a) => a.type === "create" || a.type === "update")
          .map((a) => routeKey(a as never)),
      ),
    ].sort(),
  };

  const ok =
    missing.length === 0 &&
    extra.length === 0 &&
    fields.every((f) => f.ok) &&
    gapsMissing.length === 0 &&
    gapsExtra.length === 0 &&
    citationsMissing.length === 0 &&
    sortMissing.length === 0 &&
    sortExtra.length === 0 &&
    forbidden.length === 0 &&
    unsupported.length === 0;

  return {
    scenarioId: expected.scenarioId,
    mapping,
    missingActions: missing,
    extraActions: extra,
    fields,
    gapsMissing,
    gapsExtra,
    citationsMissing,
    sortMissing,
    sortExtra,
    forbidden,
    unsupported,
    routing,
    ok,
  };
}

export function formatComparison(c: Comparison): string {
  const lines = [`${c.scenarioId}: ${c.ok ? "OK" : "MISMATCH"}`];
  const list = (label: string, xs: string[]) =>
    xs.length && lines.push(`  ${label}:`, ...xs.map((x) => `    - ${x}`));
  list("missing actions", c.missingActions);
  list("extra actions", c.extraActions);
  list(
    "field mismatches",
    c.fields
      .filter((f) => !f.ok)
      .map(
        (f) =>
          `${f.ref}.${f.path} (${f.kind}) expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.actual)}`,
      ),
  );
  list("gaps missing", c.gapsMissing);
  list("gaps extra", c.gapsExtra);
  list("citations missing", c.citationsMissing);
  list("sort suggestions missing", c.sortMissing);
  list("sort suggestions extra", c.sortExtra);
  list("forbidden", c.forbidden);
  list("unsupported fields", c.unsupported);
  return lines.join("\n");
}
