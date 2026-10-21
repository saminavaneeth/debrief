import {
  type Evidence,
  type FieldSupport,
  type FillDirective,
  type KnowledgeCitation,
  type PatchOp,
  type UpdateDirective,
} from "@/domain";
import { addDays } from "@/lib/time";
import { findDurations, findRelativeDates } from "../nlp/numbers";
import { capitalize, findKeywords, truncate } from "../nlp/text";
import type { DraftRecord, DraftTarget, GapSeed, ScenarioContext } from "../types";
import {
  description,
  eventTime,
  peopleIn,
  primaryArea,
  primaryEvidence,
  readable,
} from "./fill-helpers";
import {
  incidentSeverity,
  injury,
  recordability,
  riskFromCategory,
  severityFromCategory,
} from "./rules";
import { categoryScores, contentText, entitiesIn, instanceEvidence, isContent } from "./scope";

/* ------------------------------------------------------------------ JSON Schema shape */

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  pattern?: string;
  format?: string;
  default?: unknown;
  description?: string;
  title?: string;
  "x-fill"?: FillDirective;
  "x-update"?: UpdateDirective;
  "x-gapQuestion"?: string;
  "x-requiredWhen"?: { field: string; op: string; value?: unknown }[];
  "x-picklist"?: string;
}

/** Enum values of a property, looking through `anyOf` (nullable / optional wrappers). */
export function enumOf(s: JsonSchema | undefined): unknown[] | undefined {
  if (!s) return undefined;
  if (s.enum) return s.enum;
  for (const a of s.anyOf ?? []) {
    const e = enumOf(a);
    if (e) return e;
  }
  return undefined;
}

/* ------------------------------------------------------------------ fill machinery */

interface Scope {
  ctx: ScenarioContext;
  target: DraftTarget;
  evidence: Evidence[];
  primary?: Evidence;
  siblingTypes: string[];
  /** Properties of the object being filled (for picklist labels in titles). */
  props?: Record<string, JsonSchema>;
}

interface Filled {
  value: unknown;
  support: FieldSupport;
  unresolved?: GapSeed[];
}

const ev = (
  ids: (string | undefined)[],
  rule?: string,
  citations: KnowledgeCitation[] = [],
): FieldSupport => {
  const evidenceIds = [...new Set(ids.filter(Boolean) as string[])];
  return {
    source: rule ? "derived" : "evidence",
    evidenceIds,
    citations,
    ...(rule ? { rule } : {}),
  };
};

function cueHits(evidence: Evidence[], cues: readonly string[], skipNegated = true) {
  const out: { evidence: Evidence; keyword: string; start: number; end: number }[] = [];
  for (const e of evidence.filter(isContent)) {
    for (const h of findKeywords(contentText(e), cues)) {
      if (skipNegated && h.negated) continue;
      out.push({ evidence: e, ...h });
    }
  }
  return out;
}

function picklistLabel(scope: Scope, prop: JsonSchema | undefined, value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  const name = prop?.["x-picklist"];
  const server = scope.ctx.servers.find((s) => s.id === scope.target.instance.server);
  const option = name ? server?.picklists[name]?.find((o) => o.value === value) : undefined;
  if (option) return option.label.replace(/^\d+\s*·\s*/, "");
  return typeof value === "string" ? capitalize(value.replaceAll("_", " ")) : String(value ?? "");
}

const ORDER: FillDirective["kind"][] = [
  "statements",
  "area",
  "site",
  "assets",
  "contractor",
  "capturer",
  "eventTime",
  "enumKeywords",
  "flag",
  "person",
  "people",
  "category",
  "actions",
  "documentField",
  "duration",
  "roster",
  "actionItems",
  "rule",
  "regulation",
  "guidance",
  "context",
  "title",
];
const RULE_ORDER = [
  "injury",
  "recordability",
  "recordabilityBasis",
  "severity",
  "riskFromCategory",
  "severityFromCategory",
];

function fillOne(
  scope: Scope,
  key: string,
  prop: JsonSchema,
  d: FillDirective,
  payload: Record<string, unknown>,
  support: Record<string, FieldSupport>,
  titleTemplate: string,
): Filled | undefined {
  const { ctx, target } = scope;
  const instance = target.instance;
  const evidence = scope.evidence;
  const content = evidence.filter(isContent);
  const allowed = enumOf(prop);
  const isArray = prop.type === "array";

  switch (d.kind) {
    case "statements": {
      // A condition record next to a new incident/meeting keeps to its own evidence; the
      // incident carries the full story. Child items (audit findings) take the whole scenario.
      const eventSibling = target.siblings.some(
        (s) =>
          s.instance.key !== instance.key &&
          s.instance.manifest.matching.strategy === "event" &&
          s.match.decision === "create",
      );
      const core = new Set(instance.coreEvidenceIds);
      const own = evidence.filter((e) => core.has(e.id));
      const useCore =
        instance.manifest.matching.strategy === "condition" &&
        target.match.decision === "create" &&
        eventSibling &&
        own.length > 0;
      const r = description(useCore ? own : evidence);
      return r && { value: r.value, support: ev(r.evidenceIds) };
    }
    case "area": {
      const r = primaryArea(ctx, evidence, instance.subjectAssets);
      return (
        r && { value: r.id, support: ev(r.evidenceIds, r.evidenceIds.length ? undefined : r.rule) }
      );
    }
    case "site": {
      const area =
        typeof payload.areaId === "string" ? ctx.org.areas.get(payload.areaId) : undefined;
      if (area)
        return {
          value: area.siteId,
          support: ev(support.areaId?.evidenceIds ?? [], "site of the area"),
        };
      const asset = instance.subjectAssets.map((a) => ctx.org.assets.get(a)).find(Boolean);
      if (asset) return { value: asset.siteId, support: ev([], `site of ${asset.id}`) };
      const meta = evidence.find((e) => e.kind === "metadata" && e.label === "siteId");
      return meta && { value: meta.value, support: ev([meta.id]) };
    }
    case "assets": {
      if (instance.subjectAssets.length === 0) return undefined;
      const ids = ctx.entities
        .filter(
          (m) =>
            m.type === "asset" &&
            instance.subjectAssets.includes(m.id) &&
            evidence.some((e) => e.id === m.evidenceId),
        )
        .map((m) => m.evidenceId);
      return { value: instance.subjectAssets, support: ev(ids) };
    }
    case "contractor": {
      const ids = new Set(evidence.map((e) => e.id));
      const m = ctx.entities.find((x) => x.type === "contractor" && ids.has(x.evidenceId));
      return m && { value: m.id, support: ev([m.evidenceId]) };
    }
    case "capturer": {
      const m = evidence.find((e) => e.kind === "metadata" && e.label === "capturedBy");
      return m && { value: m.value, support: ev([m.id]) };
    }
    case "eventTime": {
      const r = eventTime(ctx, evidence, d.documentFields);
      return { value: r.value, support: ev(r.evidenceIds) };
    }
    case "enumKeywords": {
      let best: { value: string; ids: string[] } | undefined;
      for (const [value, cues] of Object.entries(d.map)) {
        if (allowed && !allowed.includes(value)) continue;
        const hits = cueHits(evidence, cues, d.negation);
        const distinct = new Set(hits.map((h) => h.keyword)).size;
        if (distinct > 0 && (!best || distinct > best.ids.length))
          best = { value, ids: hits.map((h) => h.evidence.id) };
      }
      return best && { value: best.value, support: ev(best.ids) };
    }
    case "flag": {
      const hit = cueHits(evidence, d.cues)[0];
      return hit && { value: true, support: ev([hit.evidence.id]) };
    }
    case "person": {
      let found: { id: string; evidenceIds: string[] } | undefined;
      if (d.documentField) {
        const f = ctx.documentFields.get(d.documentField);
        const m = f
          ? ctx.entities.find(
              (x) =>
                x.type === "person" &&
                ctx.evidence.find((e) => e.id === x.evidenceId)?.provenance.type ===
                  "document_field" &&
                x.artifactId === f.artifactId &&
                entitiesIn(ctx, f).some((y) => y.evidenceId === x.evidenceId),
            )
          : undefined;
        if (m) found = { id: m.id, evidenceIds: [f!.id, m.evidenceId] };
      }
      if (!found && d.cues) {
        for (const h of cueHits(evidence, d.cues)) {
          const p = peopleIn(ctx, h.evidence)[0];
          if (p) {
            found = { id: p.id, evidenceIds: [h.evidence.id, p.evidenceId] };
            break;
          }
        }
      }
      if (!found && d.fallback === "capturer") {
        const m = evidence.find((e) => e.kind === "metadata" && e.label === "capturedBy");
        if (m) found = { id: String(m.value), evidenceIds: [m.id] };
      }
      return found && { value: isArray ? [found.id] : found.id, support: ev(found.evidenceIds) };
    }
    case "people": {
      const items: { personId: string; name: string; role: string }[] = [];
      const ids: string[] = [];
      for (const e of content.filter((x) => x.kind === "statement")) {
        for (const p of peopleIn(ctx, e)) {
          if (items.some((i) => i.personId === p.id)) continue;
          const role = Object.entries(d.roles).find(([, cues]) =>
            findKeywords(e.text, cues).some((h) => !h.negated),
          )?.[0];
          if (!role) continue;
          items.push({ personId: p.id, name: ctx.org.people.get(p.id)?.name ?? p.surface, role });
          ids.push(e.id, p.evidenceId);
        }
      }
      return items.length ? { value: items, support: ev(ids) } : undefined;
    }
    case "category": {
      const best = categoryScores(ctx, evidence)[0];
      if (!best) return undefined;
      const reg = ctx.knowledge.regulationFor(best.id, content.map(contentText).join(" "));
      return {
        value: best.id,
        support: ev(best.evidenceIds, undefined, reg ? [reg.citation] : []),
      };
    }
    case "actions": {
      const hits = cueHits(
        evidence.filter((e) => e.kind === "statement"),
        d.cues,
      );
      const seen = new Set<string>();
      const out: string[] = [];
      const ids: string[] = [];
      for (const h of hits) {
        if (seen.has(h.evidence.id)) continue;
        seen.add(h.evidence.id);
        out.push(truncate(h.evidence.text, 140));
        ids.push(h.evidence.id);
      }
      return out.length ? { value: out, support: ev(ids) } : undefined;
    }
    case "documentField": {
      const f = ctx.documentFields.get(d.field);
      if (f && typeof f.value === "string") return { value: f.value, support: ev([f.id]) };
      for (const h of cueHits(
        evidence.filter((e) => e.kind === "statement"),
        d.cues ?? [],
      )) {
        const clause = h.evidence.text.slice(h.end).split(/[,.;]/)[0].trim();
        if (clause) return { value: capitalize(clause), support: ev([h.evidence.id]) };
      }
      return undefined;
    }
    case "duration": {
      for (const e of evidence.filter((x) => x.kind === "statement")) {
        const m = findDurations(e.text)[0];
        if (m) return { value: m.minutes, support: ev([e.id]) };
      }
      return undefined;
    }
    case "roster": {
      const artifacts = new Set(evidence.map((e) => e.artifactId));
      const table = ctx.tables.find(
        (t) => artifacts.has(t.artifactId) && t.columns.some((c) => /name/.test(c)),
      );
      if (!table) return undefined;
      const nameCol = table.columns.find((c) => /name/.test(c))!;
      const value: { personId?: string; name: string }[] = [];
      const unresolved: GapSeed[] = [];
      for (const row of table.rows) {
        const name = row.cells[nameCol]?.trim();
        if (!name) continue;
        const personId = ctx.gazetteer.personByName(name);
        value.push(personId ? { personId, name } : { name });
        if (!personId) {
          unresolved.push({
            fieldPath: `${key}[${name}].personId`,
            question: (prop["x-gapQuestion"] ?? "Who is {{name}}?").replace("{{name}}", name),
            answerType: "person",
          });
        }
      }
      return value.length
        ? { value, support: ev(table.rows.map((r) => r.evidenceId)), unresolved }
        : undefined;
    }
    case "actionItems": {
      const items: { title: string; ownerRef?: string; dueDate?: string }[] = [];
      const ids: string[] = [];
      for (const e of evidence.filter((x) => x.kind === "statement")) {
        const hit = findKeywords(e.text, d.cues).find((h) => !h.negated);
        if (!hit) continue;
        let title = e.text.replace(/^[^:]{0,30}:\s*/, "").replace(/[.]$/, "");
        const owner = peopleIn(ctx, e)[0];
        const due = findRelativeDates(e.text, ctx.date)[0];
        if (due)
          title = title.replace(
            new RegExp(
              `\\s*(?:by|before|on)?\\s*(?:end of day\\s+)?${e.text.slice(due.start, due.end)}`,
              "i",
            ),
            "",
          );
        title = title.replace(/,?\s*\w+ owns it$/i, "").trim();
        items.push({
          title: capitalize(truncate(title, 120)),
          ...(owner ? { ownerRef: owner.id } : {}),
          ...(due ? { dueDate: due.date } : {}),
        });
        ids.push(e.id, ...(owner ? [owner.evidenceId] : []));
      }
      return items.length ? { value: items, support: ev(ids) } : undefined;
    }
    case "regulation": {
      const category = (payload.category as string | undefined) ?? instance.categories[0];
      if (!category) return undefined;
      const reg = ctx.knowledge.regulationFor(category, content.map(contentText).join(" "));
      return (
        reg && {
          value: reg.reference,
          support: ev(
            content.slice(0, 3).map((e) => e.id),
            `regulation for ${category}`,
            [reg.citation],
          ),
        }
      );
    }
    case "guidance": {
      const category = (payload.category as string | undefined) ?? instance.categories[0];
      if (!category) return undefined;
      const lines = ctx.knowledge.guidanceFor(category, content.map(contentText).join(" "));
      if (lines.length === 0) return undefined;
      const citations = lines.map((g) => ({ docId: g.docId, section: g.section, excerpt: g.line }));
      return {
        value: lines.map((g, i) => ({
          title: g.action,
          ownerRef: g.ownerRef,
          dueDate: addDays(ctx.date, g.dueDays),
          citations: [citations[i]],
        })),
        support: ev(
          content.slice(0, 3).map((e) => e.id),
          `guidance: ${lines.map((g) => g.situation).join("; ")}`,
          citations,
        ),
      };
    }
    case "rule": {
      switch (d.rule) {
        case "injury": {
          if (!["injury", "illness"].includes(String(payload.incidentType))) return undefined;
          const r = injury(evidence);
          return r && { value: r.value, support: ev(r.evidenceIds) };
        }
        case "recordability":
        case "recordabilityBasis": {
          const inj = payload.injury as { treatment: string; returnedToWork: boolean } | undefined;
          const r = recordability(ctx, inj, support.injury?.evidenceIds ?? [], evidence);
          if (!r) return undefined;
          const part = d.rule === "recordability" ? r.recordable : r.basis;
          return { value: part.value, support: ev(part.evidenceIds, part.rule, part.citations) };
        }
        case "severity": {
          const inj = payload.injury as { treatment?: string } | undefined;
          const r = incidentSeverity(payload.incidentType as string | undefined, inj?.treatment);
          return (
            r && {
              value: r.value,
              support: ev(
                [
                  ...(support.incidentType?.evidenceIds ?? []),
                  ...(support.injury?.evidenceIds ?? []),
                ],
                r.rule,
              ),
            }
          );
        }
        case "riskFromCategory": {
          const r = riskFromCategory(ctx, payload.category as string | undefined);
          return r && { value: r.value, support: ev(support.category?.evidenceIds ?? [], r.rule) };
        }
        case "severityFromCategory": {
          const category = (payload.category as string | undefined) ?? instance.categories[0];
          const r = severityFromCategory(ctx, category, evidence);
          return (
            r && {
              value: r.value,
              support: ev(
                support.category?.evidenceIds ?? content.slice(0, 2).map((e) => e.id),
                r.rule,
              ),
            }
          );
        }
      }
      return undefined;
    }
    case "context": {
      const hit = Object.entries(d.map).find(([type]) => scope.siblingTypes.includes(type));
      if (hit) {
        const name = hit[0].replaceAll("_", " ");
        return {
          value: hit[1],
          support: ev([], `proposed together with ${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`),
        };
      }
      return d.default
        ? {
            value: d.default,
            support: ev([], "found on a walk (no inspection, incident or audit involved)"),
          }
        : undefined;
    }
    case "title": {
      const props = scope.props ?? {};
      const primaryText = scope.primary ? truncate(readable(scope.primary), 100) : "";
      const area =
        typeof payload.areaId === "string" ? ctx.org.areas.get(payload.areaId)?.name : undefined;
      const ids = new Set<string>(scope.primary ? [scope.primary.id] : []);
      let title = titleTemplate.replace(/\{(\w+)\}/g, (_, name: string) => {
        if (name === "primary") return primaryText;
        if (name === "area") return area ?? "";
        const v = payload[name];
        for (const id of support[name]?.evidenceIds ?? []) ids.add(id);
        return v === undefined || (Array.isArray(v) && v.length === 0)
          ? ""
          : picklistLabel(scope, props[name], v);
      });
      title = title
        .replace(/^[\s:,·-]+|[\s:,·-]+$/g, "")
        .replace(/\s+([:,])/g, "$1")
        .replace(/:\s*:/g, ":");
      return title
        ? { value: capitalize(title), support: ev([...ids], "title template") }
        : undefined;
    }
  }
}

function fillObject(outer: Scope, schema: JsonSchema, titleTemplate: string) {
  const props = schema.properties ?? {};
  const scope: Scope = { ...outer, props };
  const payload: Record<string, unknown> = {};
  const support: Record<string, FieldSupport> = {};
  const unresolved: GapSeed[] = [];
  const entries = Object.entries(props).filter(([, p]) => p["x-fill"]);
  const rank = (d: FillDirective) =>
    ORDER.indexOf(d.kind) * 10 + (d.kind === "rule" ? RULE_ORDER.indexOf(d.rule) : 0);
  entries.sort(([, a], [, b]) => rank(a["x-fill"]!) - rank(b["x-fill"]!));
  for (const [key, prop] of entries) {
    const filled = fillOne(scope, key, prop, prop["x-fill"]!, payload, support, titleTemplate);
    if (!filled || filled.value === undefined) continue;
    payload[key] = filled.value;
    support[key] = filled.support;
    if (filled.unresolved) unresolved.push(...filled.unresolved);
  }
  // Scalar schema defaults (e.g. a new hazard is `open`) are shown, marked as defaults.
  for (const [key, prop] of Object.entries(props)) {
    if (key in payload || prop.default === undefined || typeof prop.default === "object") continue;
    payload[key] = prop.default;
    support[key] = { source: "schema_default", evidenceIds: [], citations: [] };
  }
  return { payload, support, unresolved };
}

/* ------------------------------------------------------------------ public */

function schemaFor(ctx: ScenarioContext, target: DraftTarget): JsonSchema {
  const s = ctx.servers.find((x) => x.id === target.instance.server)?.schemas[
    target.instance.recordType
  ];
  if (!s)
    throw new Error(
      `No schema published for ${target.instance.server}/${target.instance.recordType}`,
    );
  return s as JsonSchema;
}

function citedFrom(support: Record<string, FieldSupport>) {
  const cited = new Set<string>();
  const citations: KnowledgeCitation[] = [];
  for (const s of Object.values(support)) {
    s.evidenceIds.forEach((id) => cited.add(id));
    for (const c of s.citations)
      if (!citations.some((x) => x.docId === c.docId && x.section === c.section)) citations.push(c);
  }
  return { cited, citations };
}

/**
 * Draft one record. Creates fill the module's published JSON Schema field by field from its
 * `x-fill` directives; updates apply the manifest's update mode to the matched record.
 */
export function draft(ctx: ScenarioContext, target: DraftTarget): DraftRecord {
  const { instance, match } = target;
  const siblingDrafts = target.siblingDrafts ?? [];
  const schema = schemaFor(ctx, target);
  const evidence = instanceEvidence(ctx, instance);
  const scope: Scope = {
    ctx,
    target,
    evidence,
    primary: primaryEvidence(ctx, instance, evidence),
    siblingTypes: target.siblings
      .filter((s) => s.instance.key !== instance.key)
      .map((s) => s.instance.recordType),
  };
  const base = {
    instanceKey: instance.key,
    scenarioId: instance.scenarioId,
    server: instance.server,
    recordType: instance.recordType,
    subjectAssets: instance.subjectAssets,
    itemIds: [] as string[],
    manifest: instance.manifest,
  };
  const keywords = [...new Set(instance.keywordHits.map((h) => h.keyword))];

  if (match.decision === "create") {
    const { payload, support, unresolved } = fillObject(
      scope,
      schema,
      instance.manifest.drafting.title,
    );
    const { cited, citations } = citedFrom(support);
    const best = match.candidates[0];
    return {
      ...base,
      kind: "create",
      title: String(payload.title ?? instance.manifest.displayName),
      payload,
      fieldSupport: support,
      unresolved,
      citedEvidence: cited,
      citations,
      confidence: Number(Math.min(0.95, 0.55 + 0.08 * instance.score).toFixed(2)),
      rationale:
        `Routed to ${instance.manifest.displayName} (${keywords.slice(0, 4).join(", ")}). ` +
        (best
          ? `Closest open record ${best.id} scored ${best.score} (below 0.6), so a new record is proposed.`
          : "No matching open record, so a new record is proposed."),
    };
  }

  // Update an existing record.
  const record = match.target!.record as Record<string, unknown>;
  const mode = instance.manifest.matching.update;
  const patch: PatchOp[] = [];
  const before: Record<string, unknown> = {};
  const support: Record<string, FieldSupport> = {};
  const unresolved: GapSeed[] = [];
  const props = schema.properties ?? {};

  if (mode.mode === "patch") {
    for (const [key, prop] of Object.entries(props)) {
      const d = prop["x-update"];
      if (!d) continue;
      if (d.kind === "enumKeywords") {
        const filled = fillOne(
          scope,
          key,
          prop,
          { kind: "enumKeywords", map: d.map, negation: d.negation },
          {},
          {},
          "",
        );
        if (filled && filled.value !== record[key]) {
          patch.push({ op: "set", path: key, value: filled.value });
          before[key] = record[key];
          support[key] = filled.support;
        }
      } else if (d.kind === "raiseIfLinked") {
        const linked = target.siblings.find(
          (s) =>
            s.instance.key !== instance.key &&
            d.types.includes(s.instance.recordType) &&
            s.match.decision === "create",
        );
        const order = enumOf(prop) as string[] | undefined;
        const idx = order?.indexOf(String(record[key])) ?? -1;
        if (linked && order && idx >= 0 && idx < order.length - 1) {
          const docIds =
            typeof record.category === "string"
              ? ctx.knowledge.docsForCategory(record.category)
              : [];
          const text = evidence.filter(isContent).map(contentText).join(" ");
          const citations = docIds.flatMap((docId) =>
            ctx.knowledge
              .query(text, { docIds: [docId], limit: 1 })
              .map((h) => ctx.knowledge.citation(h)),
          );
          patch.push({ op: "set", path: key, value: order[idx + 1] });
          before[key] = record[key];
          support[key] = ev(
            linked.instance.keywordHits.map((h) => h.evidenceId),
            `raised one level: linked to a new ${linked.instance.manifest.displayName.toLowerCase()}`,
            citations,
          );
        }
      } else if (d.kind === "note") {
        const linked = siblingDrafts.find(
          (s) => s.kind === "create" && s.instanceKey !== instance.key,
        );
        const own = scope.primary
          ? readable(scope.primary)
          : evidence.find((e) => e.kind === "statement")?.text;
        const text = [
          linked
            ? `${linked.title.replace(/…$/, "")} (new ${linked.manifest.displayName.toLowerCase()}).`
            : "",
          own ? `New evidence ${ctx.date}: ${truncate(own, 160)}.` : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (text) {
          patch.push({ op: "append", path: key, value: { text } });
          support[key] = ev(
            [
              ...(scope.primary ? [scope.primary.id] : []),
              ...(linked ? [...linked.citedEvidence].slice(0, 2) : []),
            ],
            "note summarising the new evidence",
          );
        }
      }
    }
  } else if (mode.mode === "append_child") {
    const childSchema = props[mode.collection]?.items;
    if (childSchema) {
      const child = fillObject(
        scope,
        childSchema,
        instance.manifest.drafting.childTitle ?? "{primary}",
      );
      patch.push({ op: "append", path: mode.collection, value: child.payload });
      for (const [k, s] of Object.entries(child.support)) support[`${mode.collection}[+].${k}`] = s;
      unresolved.push(
        ...child.unresolved.map((u) => ({
          ...u,
          fieldPath: `${mode.collection}[+].${u.fieldPath}`,
        })),
      );
    }
  } else if (mode.mode === "complete_checklist") {
    const items = (record[mode.collection] as Record<string, unknown>[] | undefined) ?? [];
    const responses = (
      enumOf(props[mode.collection]?.items?.properties?.[mode.responseField]) ?? []
    ).filter((v) => typeof v === "string") as string[];
    const artifacts = new Set(evidence.map((e) => e.artifactId));
    let anyFail = false;
    let filledCount = 0;
    let docArtifact: string | undefined;
    const rowIds: string[] = [];
    for (const table of ctx.tables.filter((t) => artifacts.has(t.artifactId))) {
      for (const row of table.rows) {
        const rowEvidence = ctx.evidence.find((e) => e.id === row.evidenceId)!;
        const asset = entitiesIn(ctx, rowEvidence).find((m) => m.type === "asset");
        const item = asset && items.find((i) => i[mode.itemKey] === asset.id);
        if (!item) continue;
        const response = Object.values(row.cells)
          .map((c) => c.toLowerCase())
          .find((c) => responses.includes(c));
        if (!response) continue;
        const itemId = String(item.id);
        patch.push({
          op: "set",
          path: `${mode.collection}[${itemId}].${mode.responseField}`,
          value: response,
        });
        before[`${mode.collection}[${itemId}].${mode.responseField}`] =
          item[mode.responseField] ?? null;
        support[`${mode.collection}[${itemId}].${mode.responseField}`] = ev([row.evidenceId]);
        const notes = Object.entries(row.cells).find(([k]) => k === mode.notesField)?.[1];
        if (notes) {
          patch.push({
            op: "set",
            path: `${mode.collection}[${itemId}].${mode.notesField}`,
            value: notes,
          });
          support[`${mode.collection}[${itemId}].${mode.notesField}`] = ev([row.evidenceId]);
        }
        if (response === "fail") anyFail = true;
        filledCount++;
        docArtifact = table.artifactId;
        rowIds.push(row.evidenceId);
      }
    }
    if (filledCount > 0) {
      const captured = ctx.artifacts.find((a) => a.id === docArtifact)?.capturedAt;
      const capturedEvidence = ctx.evidence.find(
        (e) => e.artifactId === docArtifact && e.kind === "metadata" && e.label === "capturedAt",
      );
      for (const [key, raw] of Object.entries(mode.set)) {
        const value =
          raw === "$aggregate"
            ? anyFail
              ? "fail"
              : "pass"
            : raw === "$captureTime"
              ? captured
              : raw;
        if (value === undefined || value === record[key]) continue;
        patch.unshift({ op: "set", path: key, value });
        before[key] = record[key];
        support[key] =
          raw === "$captureTime"
            ? ev([capturedEvidence?.id])
            : ev(
                rowIds,
                raw === "$aggregate"
                  ? `${anyFail ? "at least one item failed" : "all items passed"}`
                  : `checklist completed (${filledCount} items)`,
              );
      }
    }
  }

  const { cited, citations } = citedFrom(support);
  const t = match.target!;
  const itemIds = instance.manifest.childCollections.flatMap((c) =>
    Array.isArray(record[c])
      ? (record[c] as { id?: unknown }[]).map((i) => String(i.id ?? "")).filter(Boolean)
      : [],
  );
  return {
    ...base,
    itemIds,
    kind: "update",
    targetId: t.id,
    title: t.title,
    patch,
    before,
    fieldSupport: support,
    unresolved,
    citedEvidence: cited,
    citations,
    confidence: t.score,
    rationale: `Matched ${t.id} (${t.signals.join(", ")}; score ${t.score}), so the evidence updates it instead of creating a duplicate.`,
  };
}
