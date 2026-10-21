import type { Artifact, ChangeSet, Evidence, GapQuestion, PerceptionFixture } from "@/domain";
import type { Gazetteer } from "../nlp/gazetteer";
import { draft } from "../orchestrator/drafter";
import { findGaps, toGapQuestions } from "../orchestrator/gaps";
import { findRelated, match } from "../orchestrator/matcher";
import { planScenario } from "../orchestrator/planner";
import { route } from "../orchestrator/router";
import type { AgentProvider } from "../provider";
import type { DraftRecord, DraftTarget, RelatedRecord, RoutePlan, ScenarioContext } from "../types";
import {
  documentEvidence,
  imageEvidence,
  noteEvidence,
  transcriptEvidence,
  videoEvidence,
} from "./perception";

/**
 * Demo mode: perception comes from fixtures (or what the device extracted); routing, matching,
 * drafting, gap-finding and planning are the real rule-based code paths.
 */
export class DemoProvider implements AgentProvider {
  readonly name = "demo" as const;

  constructor(private readonly gazetteer: Gazetteer) {}

  async transcribe(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]> {
    return artifact.modality === "note"
      ? noteEvidence(artifact, this.gazetteer)
      : transcriptEvidence(artifact, perception, this.gazetteer);
  }

  async analyzeImage(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]> {
    return imageEvidence(artifact, perception, this.gazetteer);
  }

  async analyzeVideo(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]> {
    return videoEvidence(artifact, perception, this.gazetteer);
  }

  async extractDocument(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]> {
    return documentEvidence(artifact, perception, this.gazetteer);
  }

  async route(ctx: ScenarioContext): Promise<RoutePlan> {
    return route(ctx);
  }

  async match(ctx: ScenarioContext, plan: RoutePlan) {
    return { matches: await match(ctx, plan), related: await findRelated(ctx, plan) };
  }

  async draft(ctx: ScenarioContext, target: DraftTarget): Promise<DraftRecord> {
    return draft(ctx, target);
  }

  async findGaps(ctx: ScenarioContext, drafts: DraftRecord[]): Promise<GapQuestion[]> {
    const seeds = findGaps(ctx, drafts);
    // Action ids are assigned by plan(); gaps are re-keyed there.
    return toGapQuestions(
      seeds,
      (k) => k,
      () => ctx.scenario.id,
    );
  }

  async plan(
    ctx: ScenarioContext,
    drafts: DraftRecord[],
    related: RelatedRecord[],
    gaps: GapQuestion[],
  ): Promise<ChangeSet> {
    let n = 0;
    const { actions, actionIdFor } = planScenario(
      ctx,
      drafts,
      related,
      () => `${ctx.scenario.id}:a${++n}`,
    );
    return {
      id: `CS-${ctx.runId}`,
      runId: ctx.runId,
      createdAt: ctx.evidence.find((e) => e.label === "capturedAt")?.value as string,
      scenarioIds: [ctx.scenario.id],
      status: "in_review",
      actions,
      gaps: gaps.map((g, i) => {
        const actionId = actionIdFor.get(g.actionId) ?? g.actionId;
        return { ...g, id: `${actionId}:g${i + 1}`, actionId };
      }),
      sortSuggestions: [],
    };
  }
}
