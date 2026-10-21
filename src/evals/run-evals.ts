import { localIso } from "@/lib/time";
import { type Comparison, compareChangeSet } from "./compare";
import { AGENT_CALL, createAgentEnv, loadExpected, loadFixtures, runFixture } from "./harness";

export interface EvalCase {
  scenarioId: string;
  variant: string;
  comparison: Comparison;
  workflows: { ruleId: string; expected: boolean; actual: boolean }[];
  push: { executed: number; total: number };
  durationMs: number;
}

export interface Ratio {
  value: number;
  num: number;
  den: number;
}

export interface EvalMetrics {
  routingAccuracy: Ratio;
  actionPrecision: Ratio;
  actionRecall: Ratio;
  fieldAccuracy: Ratio;
  unsupportedFields: number;
  gapPrecision: Ratio;
  gapRecall: Ratio;
  citationRecall: Ratio;
  sortPrecision: Ratio;
  sortRecall: Ratio;
  duplicateViolations: number;
  workflowAccuracy: Ratio;
  pushSuccess: Ratio;
}

export interface EvalReport {
  at: string;
  provider: "demo";
  cases: EvalCase[];
  metrics: EvalMetrics;
  passed: number;
  total: number;
}

const ratio = (num: number, den: number): Ratio => ({
  num,
  den,
  value: den === 0 ? 1 : Number((num / den).toFixed(4)),
});

/**
 * Run every scenario and paraphrase variant through the real pipeline (fresh in-memory runtime
 * each time), compare with the expected change set, approve everything, push, and check the
 * workflow outcomes.
 */
export async function runEvals(onCase?: (c: EvalCase) => void): Promise<EvalReport> {
  const fixtures = loadFixtures();
  const expected = loadExpected();
  const cases: EvalCase[] = [];
  for (const f of fixtures) {
    const exp = expected.find((e) => e.scenarioId === f.id);
    if (!exp) continue;
    for (const variant of [undefined, ...f.variants.map((v) => v.id)]) {
      const started = performance.now();
      const env = createAgentEnv();
      const { changeSet } = await runFixture(f, variant, env);
      const comparison = compareChangeSet(exp, changeSet);
      const approved = {
        ...changeSet,
        actions: changeSet.actions.map((a) => ({ ...a, status: "approved" as const })),
      };
      const artifacts = Object.fromEntries(
        f.artifacts.map((a) => [
          a.id,
          { modality: a.modality, ...(a.media ? { uri: a.media.uri } : {}) },
        ]),
      );
      const report = await env.runtime.gateway.executeChangeSet(approved, AGENT_CALL, {
        artifacts,
      });
      const workflows = exp.workflows.map((w) => ({
        ruleId: w.ruleId,
        expected: w.fires,
        actual: env.runtime.workflows.fired(w.ruleId, changeSet.id),
      }));
      const c: EvalCase = {
        scenarioId: f.id,
        variant: variant ?? f.id,
        comparison,
        workflows,
        push: {
          executed: report.results.filter((r) => r.status === "executed").length,
          total: report.results.length,
        },
        durationMs: Math.round(performance.now() - started),
      };
      cases.push(c);
      onCase?.(c);
    }
  }

  const sum = (fn: (c: EvalCase) => number) => cases.reduce((n, c) => n + fn(c), 0);
  const expectedActions = (c: EvalCase) =>
    Object.keys(c.comparison.mapping).length + c.comparison.missingActions.length;
  const producedActions = (c: EvalCase) =>
    Object.keys(c.comparison.mapping).length + c.comparison.extraActions.length;
  const matched = (c: EvalCase) => Object.keys(c.comparison.mapping).length;
  const exp = (id: string) => expected.find((e) => e.scenarioId === id)!;

  const metrics: EvalMetrics = {
    routingAccuracy: ratio(
      cases.filter(
        (c) =>
          JSON.stringify(c.comparison.routing.expected) ===
          JSON.stringify(c.comparison.routing.produced),
      ).length,
      cases.length,
    ),
    actionPrecision: ratio(sum(matched), sum(producedActions)),
    actionRecall: ratio(sum(matched), sum(expectedActions)),
    fieldAccuracy: ratio(
      sum((c) => c.comparison.fields.filter((f) => f.ok).length),
      sum((c) => c.comparison.fields.length),
    ),
    unsupportedFields: sum((c) => c.comparison.unsupported.length),
    gapPrecision: ratio(
      sum((c) => exp(c.scenarioId).gaps.length - c.comparison.gapsMissing.length),
      sum(
        (c) =>
          exp(c.scenarioId).gaps.length -
          c.comparison.gapsMissing.length +
          c.comparison.gapsExtra.length,
      ),
    ),
    gapRecall: ratio(
      sum((c) => exp(c.scenarioId).gaps.length - c.comparison.gapsMissing.length),
      sum((c) => exp(c.scenarioId).gaps.length),
    ),
    citationRecall: ratio(
      sum((c) => exp(c.scenarioId).citations.length - c.comparison.citationsMissing.length),
      sum((c) => exp(c.scenarioId).citations.length),
    ),
    sortPrecision: ratio(
      sum((c) => exp(c.scenarioId).sortSuggestions.length - c.comparison.sortMissing.length),
      sum(
        (c) =>
          exp(c.scenarioId).sortSuggestions.length -
          c.comparison.sortMissing.length +
          c.comparison.sortExtra.length,
      ),
    ),
    sortRecall: ratio(
      sum((c) => exp(c.scenarioId).sortSuggestions.length - c.comparison.sortMissing.length),
      sum((c) => exp(c.scenarioId).sortSuggestions.length),
    ),
    duplicateViolations: sum((c) => c.comparison.forbidden.length),
    workflowAccuracy: ratio(
      sum((c) => c.workflows.filter((w) => w.expected === w.actual).length),
      sum((c) => c.workflows.length),
    ),
    pushSuccess: ratio(
      sum((c) => c.push.executed),
      sum((c) => c.push.total),
    ),
  };
  const passed = cases.filter(
    (c) =>
      c.comparison.ok &&
      c.workflows.every((w) => w.expected === w.actual) &&
      c.push.executed === c.push.total,
  ).length;
  return { at: localIso(), provider: "demo", cases, metrics, passed, total: cases.length };
}

export const METRIC_LABELS: Record<keyof EvalMetrics, string> = {
  routingAccuracy: "Routing accuracy",
  actionPrecision: "Action precision",
  actionRecall: "Action recall",
  fieldAccuracy: "Field accuracy",
  unsupportedFields: "Unsupported fields (target 0)",
  gapPrecision: "Gap question precision",
  gapRecall: "Gap question recall",
  citationRecall: "Citation recall",
  sortPrecision: "Sort suggestion precision",
  sortRecall: "Sort suggestion recall",
  duplicateViolations: "Duplicate records (target 0)",
  workflowAccuracy: "Workflow outcomes",
  pushSuccess: "Push success",
};
