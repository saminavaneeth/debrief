import type { EhsRecord } from "@/domain";
import { toOffsetIso } from "@/lib/time";
import type {
  MatchCandidate,
  MatchResult,
  RelatedRecord,
  RoutePlan,
  RouteInstance,
  ScenarioContext,
} from "../types";
import { categoryScores, isContent } from "./scope";
import { eventTime, primaryArea } from "./fill-helpers";

/** Score at or above which new evidence updates an existing record instead of creating one. */
export const MATCH_THRESHOLD = 0.6;

type Rec = EhsRecord & Record<string, unknown>;

function signalsFor(ctx: ScenarioContext, instance: RouteInstance, rec: Rec, textScore: number) {
  const signals: string[] = [];
  let score = 0.15 * textScore;
  const assets = new Set(instance.subjectAssets);
  const items = Array.isArray(rec.items) ? (rec.items as { assetId?: string }[]) : [];
  const recAssets = new Set([...rec.assetIds, ...items.map((i) => i.assetId).filter(Boolean)]);
  const sharedAssets = [...assets].filter((a) => recAssets.has(a));

  const strategy = instance.manifest.matching.strategy;
  if (strategy === "scheduled") {
    if (rec.scheduledDate === ctx.date) {
      score += 0.4;
      signals.push(`scheduled for ${ctx.date}`);
    }
    if (assets.size) {
      const share = sharedAssets.length / assets.size;
      score += 0.5 * share;
      if (sharedAssets.length)
        signals.push(`${sharedAssets.length}/${assets.size} assets on its checklist`);
    }
    return { score: Math.min(1, score), signals };
  }

  if (sharedAssets.length) {
    score += 0.55;
    signals.push(`same asset ${sharedAssets.join(", ")}`);
  }
  const area = primaryArea(ctx, ctx.evidence);
  if (area && rec.areaId === area.id) {
    score += 0.2;
    signals.push("same area");
  }
  if (typeof rec.category === "string" && instance.categories.includes(rec.category)) {
    score += 0.2;
    signals.push(`same category (${rec.category})`);
  }
  const contractors = new Set(ctx.entities.filter((m) => m.type === "contractor").map((m) => m.id));
  if (typeof rec.contractorId === "string" && contractors.has(rec.contractorId)) {
    score += 0.45;
    signals.push("same contractor");
  }
  if (strategy === "event") {
    const window = (instance.manifest.matching.windowHours ?? 2) * 3_600_000;
    const at = Date.parse(eventTime(ctx, ctx.evidence).value);
    const recAt = Date.parse(
      String(rec.occurredAt ?? rec.observedAt ?? rec.heldAt ?? rec.createdAt),
    );
    if (Math.abs(at - recAt) > window) return { score: 0, signals: ["outside the time window"] };
    signals.push("within the time window");
  }
  return { score: Math.min(1, score), signals };
}

/**
 * Find & update: search each instance's server for open records of the same type, then score
 * candidates with structured signals (asset, area, category, contractor, schedule, time window).
 */
export async function match(ctx: ScenarioContext, plan: RoutePlan): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  for (const instance of plan.instances) {
    const m = instance.manifest.matching;
    const query = [
      ...new Set(instance.keywordHits.map((h) => h.keyword)),
      ...instance.subjectAssets,
    ].join(" ");
    const args: Record<string, unknown> = {
      recordType: instance.recordType,
      status: m.openStatuses,
      limit: 10,
    };
    if (m.strategy === "event") {
      const at = Date.parse(eventTime(ctx, ctx.evidence).value);
      const w = (m.windowHours ?? 2) * 3_600_000;
      args.from = toOffsetIso(new Date(at - w), ctx.utcOffset);
      args.to = toOffsetIso(new Date(at + w), ctx.utcOffset);
    }
    const found = await ctx.trace.step(
      "match",
      `Search ${instance.server} for open ${instance.manifest.displayName.toLowerCase()} records`,
      () => ctx.gateway.search(instance.server, args, ctx.call),
      (r) => ({ instance: instance.key, results: r.total }),
      `${instance.server}.search_records`,
    );
    // Keyword rank from the server, when the query matched anything.
    const ranked = query
      ? await ctx.gateway
          .search(instance.server, { ...args, query }, ctx.call)
          .catch(() => ({ results: [] }))
      : { results: [] };
    const maxText = Math.max(0, ...ranked.results.map((r) => Number(r.score) || 0));
    const textScore = new Map(
      ranked.results.map((r) => [String(r.id), maxText ? (Number(r.score) || 0) / maxText : 0]),
    );

    const candidates: (MatchCandidate & { record: Rec })[] = [];
    for (const hit of found.results.slice(0, 10)) {
      const rec = (await ctx.gateway.getRecord(String(hit.id), ctx.call)) as Rec;
      const { score, signals } = signalsFor(ctx, instance, rec, textScore.get(rec.id) ?? 0);
      candidates.push({
        id: rec.id,
        title: rec.title,
        score: Number(score.toFixed(3)),
        signals,
        record: rec,
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const best = candidates[0];
    const decision = best && best.score >= MATCH_THRESHOLD ? "update" : "create";
    results.push({
      instanceKey: instance.key,
      decision,
      ...(decision === "update" ? { target: best } : {}),
      candidates: candidates
        .slice(0, 3)
        .map((c) => ({ id: c.id, title: c.title, score: c.score, signals: c.signals })),
    });
  }
  return results;
}

/**
 * Open condition records (e.g. a known hazard) in the same area and category as the scenario,
 * for record types the scenario does not already create or update. Proposed as links only.
 */
export async function findRelated(ctx: ScenarioContext, plan: RoutePlan): Promise<RelatedRecord[]> {
  const routedTypes = new Set(plan.instances.map((i) => i.recordType));
  const area = primaryArea(ctx, ctx.evidence);
  if (!area) return [];
  const categories = categoryScores(
    ctx,
    ctx.evidence.filter(isContent).concat(ctx.evidence.filter((e) => e.kind === "metadata")),
  )
    .filter((c) => c.score >= 2)
    .map((c) => c.id);
  if (categories.length === 0) return [];
  const out: RelatedRecord[] = [];
  for (const server of ctx.servers) {
    for (const rt of server.manifest.recordTypes) {
      if (rt.matching.strategy !== "condition" || routedTypes.has(rt.recordType)) continue;
      const hits = await ctx.records.search("", {
        recordTypes: [rt.recordType],
        statuses: rt.matching.openStatuses,
        areaId: area.id,
        categories,
      });
      for (const h of hits) {
        out.push({
          scenarioId: ctx.scenario.id,
          id: h.record.id,
          server: server.id,
          recordType: rt.recordType,
          title: h.record.title,
          score: 0.7,
          reason: `Open ${rt.displayName.toLowerCase()} in the same area and category (${h.record.category})`,
        });
      }
    }
  }
  return out;
}
