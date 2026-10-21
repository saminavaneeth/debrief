import type { Artifact, ChangeSet, Evidence, GapQuestion, PerceptionFixture } from "@/domain";
import type {
  DraftRecord,
  DraftTarget,
  MatchResult,
  RelatedRecord,
  RoutePlan,
  ScenarioContext,
} from "./types";

export type { DraftRecord, MatchResult, RoutePlan, ScenarioContext } from "./types";

/**
 * Every AI capability behind one interface. `DemoProvider` fakes only perception (fixtures, or
 * what the device extracted) and reasons with real rule-based code; an LLM-backed provider can
 * implement the same methods.
 */
export interface AgentProvider {
  readonly name: "demo" | "llm";

  // Perception: turn artifacts into Evidence
  transcribe(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]>;
  analyzeImage(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]>;
  analyzeVideo(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]>;
  extractDocument(artifact: Artifact, perception?: PerceptionFixture): Promise<Evidence[]>;

  // Reasoning: turn Evidence into a ChangeSet
  route(ctx: ScenarioContext): Promise<RoutePlan>;
  match(
    ctx: ScenarioContext,
    plan: RoutePlan,
  ): Promise<{ matches: MatchResult[]; related: RelatedRecord[] }>;
  draft(ctx: ScenarioContext, target: DraftTarget): Promise<DraftRecord>;
  findGaps(ctx: ScenarioContext, drafts: DraftRecord[]): Promise<GapQuestion[]>;
  plan(
    ctx: ScenarioContext,
    drafts: DraftRecord[],
    related: RelatedRecord[],
    gaps: GapQuestion[],
  ): Promise<ChangeSet>;
}
