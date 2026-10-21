import type { Evidence } from "@/domain";
import type { RouteInstance, RoutePlan, ScenarioContext } from "../types";
import { categoryScores, entitiesIn, isContent, keywordEvidence } from "./scope";

/** Distinct routing keywords needed before a record type is proposed. */
export const ROUTE_THRESHOLD = 2;

/**
 * Score every record type published by the enabled servers against the scenario's evidence,
 * using only the manifests' routing hints. Condition records (hazards, open audits) get one
 * instance per asset they are about; events and scheduled records get one per scenario.
 */
export function route(ctx: ScenarioContext): RoutePlan {
  const content = ctx.evidence.filter(isContent);
  const instances: RouteInstance[] = [];
  const scores: RoutePlan["scores"] = [];

  for (const server of ctx.servers) {
    for (const rt of server.manifest.recordTypes) {
      const hits = keywordEvidence(content, rt.routing.keywords, true);
      const distinct = [...new Set(hits.map((h) => h.keyword))];
      scores.push({
        server: server.id,
        recordType: rt.recordType,
        score: distinct.length,
        keywords: distinct,
      });
      if (distinct.length < ROUTE_THRESHOLD) continue;

      const relevant = new Set(hits.map((h) => h.evidence.id));
      for (const e of content) {
        if (e.kind === "image_finding" && e.label && rt.routing.categories.includes(e.label))
          relevant.add(e.id);
      }
      const keywordHits = hits.map((h) => ({ keyword: h.keyword, evidenceId: h.evidence.id }));
      const base = {
        scenarioId: ctx.scenario.id,
        server: server.id,
        recordType: rt.recordType,
        manifest: rt,
      };

      if (rt.matching.strategy !== "condition") {
        const all = ctx.evidence.map((e) => e.id);
        const assets = [
          ...new Set(ctx.entities.filter((m) => m.type === "asset").map((m) => m.id)),
        ];
        instances.push({
          ...base,
          key: `${ctx.scenario.id}/${rt.recordType}`,
          score: distinct.length,
          keywordHits,
          evidenceIds: all,
          coreEvidenceIds: [...relevant],
          subjectAssets: assets,
          categories: categoryScores(ctx, ctx.evidence)
            .filter((c) => c.score >= 2)
            .map((c) => c.id),
        });
        continue;
      }

      // Condition records: group the relevant evidence by the asset it is about.
      const groups = new Map<string, Evidence[]>();
      const loose: Evidence[] = [];
      for (const e of content.filter((x) => relevant.has(x.id))) {
        const assets = [
          ...new Set(
            entitiesIn(ctx, e)
              .filter((m) => m.type === "asset")
              .map((m) => m.id),
          ),
        ];
        if (assets.length === 0) loose.push(e);
        for (const a of assets) groups.set(a, [...(groups.get(a) ?? []), e]);
      }
      if (groups.size === 0) {
        // Nothing names an asset, but the scenario is about exactly one: that is the subject.
        const scenarioAssets = [
          ...new Set(ctx.entities.filter((m) => m.type === "asset").map((m) => m.id)),
        ];
        groups.set(scenarioAssets.length === 1 ? scenarioAssets[0] : "", loose);
      } else if (groups.size === 1)
        groups.set([...groups.keys()][0], [...[...groups.values()][0], ...loose]);

      const single = groups.size === 1;
      for (const [asset, evidence] of groups) {
        // One subject in the scenario: the whole scenario is about it.
        const ids = new Set((single ? ctx.evidence : evidence).map((e) => e.id));
        // Bring along entity and metadata records of the same sentences/captures.
        for (const e of evidence) for (const m of entitiesIn(ctx, e)) ids.add(m.evidenceId);
        const artifacts = new Set(evidence.map((e) => e.artifactId));
        for (const e of ctx.evidence)
          if (e.kind === "metadata" && artifacts.has(e.artifactId)) ids.add(e.id);
        const scoped = ctx.evidence.filter((e) => ids.has(e.id));
        const kw = keywordHits.filter((h) => ids.has(h.evidenceId));
        instances.push({
          ...base,
          key: `${ctx.scenario.id}/${rt.recordType}${asset ? `/${asset}` : ""}`,
          score: new Set(kw.map((h) => h.keyword)).size || distinct.length,
          keywordHits: kw,
          evidenceIds: [...ids],
          coreEvidenceIds: evidence.map((e) => e.id),
          subjectAssets: asset ? [asset] : [],
          categories: categoryScores(ctx, scoped)
            .slice(0, 2)
            .map((c) => c.id),
        });
      }
    }
  }
  scores.sort((a, b) => b.score - a.score);
  return { scenarioId: ctx.scenario.id, instances, scores };
}
