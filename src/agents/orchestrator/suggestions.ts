import type { Artifact, Evidence, SortSuggestion } from "@/domain";
import type { EntityMention, RouteInstance } from "../types";

export interface ProcessedScenario {
  id: string;
  title: string;
  instances: RouteInstance[];
  entities: EntityMention[];
}

/**
 * Suggest moving Inbox captures into a scenario that is about the same asset, and merging
 * processed scenarios that share an asset. The user decides; nothing moves automatically.
 */
export function sortSuggestions(
  inbox: { artifact: Artifact; evidence: Evidence[]; entities: EntityMention[] }[],
  scenarios: ProcessedScenario[],
): SortSuggestion[] {
  const out: SortSuggestion[] = [];
  const assetsOf = (s: ProcessedScenario) =>
    new Set([
      ...s.instances.flatMap((i) => i.subjectAssets),
      ...s.entities.filter((m) => m.type === "asset").map((m) => m.id),
    ]);

  for (const item of inbox) {
    const assets = new Set(item.entities.filter((m) => m.type === "asset").map((m) => m.id));
    if (assets.size === 0) continue;
    let best: { s: ProcessedScenario; shared: string[] } | undefined;
    for (const s of scenarios) {
      const shared = [...assets].filter((a) => assetsOf(s).has(a));
      if (shared.length && (!best || shared.length > best.shared.length)) best = { s, shared };
    }
    if (!best) continue;
    out.push({
      id: `move:${item.artifact.id}:${best.s.id}`,
      kind: "move",
      artifactIds: [item.artifact.id],
      fromScenarioId: null,
      toScenarioId: best.s.id,
      rationale: `The Inbox ${item.artifact.modality} from ${item.artifact.capturedAt.slice(11, 16)} mentions ${best.shared.join(", ")}, which “${best.s.title}” is about. Moving it in adds its evidence to the same record instead of a duplicate.`,
      confidence: 0.85,
    });
  }

  for (let i = 0; i < scenarios.length; i++) {
    for (let j = i + 1; j < scenarios.length; j++) {
      const a = scenarios[i];
      const b = scenarios[j];
      const shared = [...assetsOf(a)].filter((x) => assetsOf(b).has(x));
      if (!shared.length) continue;
      out.push({
        id: `merge:${b.id}:${a.id}`,
        kind: "merge",
        artifactIds: [],
        fromScenarioId: b.id,
        toScenarioId: a.id,
        rationale: `“${a.title}” and “${b.title}” are both about ${shared.join(", ")}.`,
        confidence: 0.6,
      });
    }
  }
  return out;
}
