import { DemoProvider } from "@/agents/demo/demo-provider";
import { Gazetteer } from "@/agents/nlp/gazetteer";
import { runPipeline } from "@/agents/orchestrator/pipeline";
import type { ProcessInput } from "@/agents/types";
import { type CallContext, ExpectedChangeSet, ScenarioFixture } from "@/domain";
import { dataPath, listFiles, readJson } from "@/lib/data-files";
import { fixedClock } from "@/lib/time";
import { createRuntime, type Runtime } from "@/mcp/runtime";
import { getKnowledgeIndex } from "@/rag/knowledge-index";
import { RecordsIndex } from "@/rag/records-index";

/** Run demo scenarios through the real pipeline against a fresh in-memory runtime. */

export const DEMO_NOW = "2026-10-21T16:30:00-05:00";
export const AGENT_CALL: CallContext = { actor: "P-001", roles: ["ehs_specialist"], via: "agent" };

export const loadFixtures = () =>
  listFiles(dataPath("fixtures", "scenarios"), ".json").map((f) =>
    ScenarioFixture.parse(readJson(f)),
  );
export const loadExpected = () =>
  listFiles(dataPath("fixtures", "expected"), ".json").map((f) =>
    ExpectedChangeSet.parse(readJson(f)),
  );

/** Fixture (optionally a paraphrase variant) → processing input. */
export function inputFor(fixture: ScenarioFixture, variantId?: string): ProcessInput {
  const variant = variantId ? fixture.variants.find((v) => v.id === variantId) : undefined;
  if (variantId && !variant) throw new Error(`Unknown variant ${variantId}`);
  const artifacts = fixture.artifacts.map((a) =>
    variant?.artifactText[a.id] !== undefined ? { ...a, text: variant.artifactText[a.id] } : a,
  );
  return {
    runId: `${variantId ?? fixture.id}`,
    shift: fixture.shift,
    scenarios: fixture.scenarios,
    artifacts: artifacts.filter((a) => a.scenarioId !== null),
    inbox: artifacts.filter((a) => a.scenarioId === null),
    perception: { ...fixture.perception, ...(variant?.perception ?? {}) },
  };
}

export function createAgentEnv(
  runtime: Runtime = createRuntime({ snapshotPath: null, clock: fixedClock(DEMO_NOW) }),
) {
  const gazetteer = new Gazetteer(runtime.org);
  const deps = {
    gateway: runtime.gateway,
    knowledge: getKnowledgeIndex(),
    records: new RecordsIndex(runtime.gateway, AGENT_CALL),
    org: runtime.org,
    gazetteer,
    call: AGENT_CALL,
  };
  return { runtime, deps, provider: new DemoProvider(gazetteer) };
}

export async function runFixture(
  fixture: ScenarioFixture,
  variantId?: string,
  env = createAgentEnv(),
) {
  const result = await runPipeline(env.provider, env.deps, inputFor(fixture, variantId));
  return { ...result, env };
}
