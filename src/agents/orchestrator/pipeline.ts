import type { CallContext, ChangeSet, Evidence, RunTrace, TraceStep } from "@/domain";
import type { OrgDirectory } from "@/lib/org";
import { localIso, toOffsetIso } from "@/lib/time";
import type { Gateway } from "@/mcp/gateway";
import type { KnowledgeIndex } from "@/rag/knowledge-index";
import type { RecordsIndex } from "@/rag/records-index";
import type { Gazetteer } from "../nlp/gazetteer";
import type { AgentProvider } from "../provider";
import type { DraftRecord, ProcessInput, ScenarioContext, TraceRecorder } from "../types";
import { type ContextBase, buildScenarioContext, indexEvidence, ingestArtifact } from "./context";
import { sortSuggestions, type ProcessedScenario } from "./suggestions";

export interface PipelineDeps {
  gateway: Gateway;
  knowledge: KnowledgeIndex;
  records: RecordsIndex;
  org: OrgDirectory;
  gazetteer: Gazetteer;
  call: CallContext;
}

export interface ProcessResult {
  changeSet: ChangeSet;
  evidence: Evidence[];
  trace: RunTrace;
  /** Titles of the knowledge documents cited, by doc id. */
  knowledge: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function recorder(
  steps: TraceStep[],
  utcOffset: string,
  delayMs: number,
  onStep?: (s: TraceStep) => void,
): TraceRecorder {
  let n = 0;
  return {
    async step(stage, label, run, detail, tool) {
      const id = `step-${++n}`;
      const started = performance.now();
      const startedAt = toOffsetIso(new Date(), utcOffset);
      onStep?.({
        id,
        stage,
        label,
        startedAt,
        durationMs: 0,
        status: "running",
        ...(tool ? { tool } : {}),
        detail: {},
      });
      try {
        const result = await run();
        if (delayMs) await sleep(delayMs);
        const step: TraceStep = {
          id,
          stage,
          label,
          startedAt,
          durationMs: Math.round(performance.now() - started),
          status: "ok",
          ...(tool ? { tool } : {}),
          detail: detail ? detail(result) : {},
        };
        steps.push(step);
        onStep?.(step);
        return result;
      } catch (err) {
        const step: TraceStep = {
          id,
          stage,
          label,
          startedAt,
          durationMs: Math.round(performance.now() - started),
          status: "error",
          ...(tool ? { tool } : {}),
          detail: { error: err instanceof Error ? err.message : String(err) },
        };
        steps.push(step);
        onStep?.(step);
        throw err;
      }
    },
  };
}

/**
 * Process scenarios end to end: ingest → route → match → draft → gaps → plan, with every step
 * and tool call recorded in the run trace. Returns one change set covering all scenarios.
 */
export async function runPipeline(
  provider: AgentProvider,
  deps: PipelineDeps,
  input: ProcessInput,
  onStep?: (s: TraceStep) => void,
): Promise<ProcessResult> {
  const steps: TraceStep[] = [];
  const utcOffset = deps.org.utcOffset;
  const trace = recorder(steps, utcOffset, input.stepDelayMs ?? 0, onStep);
  const startedAt = localIso();
  const servers = await trace.step(
    "route",
    "Discover connected systems",
    () => deps.gateway.discovery.servers(),
    (s) => ({
      servers: s.map((x) => x.id),
      recordTypes: s.flatMap((x) => x.manifest.recordTypes.map((t) => t.recordType)),
    }),
  );
  const base: ContextBase = {
    runId: input.runId,
    utcOffset,
    servers,
    org: deps.org,
    gazetteer: deps.gazetteer,
    knowledge: deps.knowledge,
    records: deps.records,
    gateway: deps.gateway,
    call: deps.call,
    trace,
  };

  const changeSet: ChangeSet = {
    id: `CS-${input.runId}`,
    runId: input.runId,
    createdAt: startedAt,
    scenarioIds: input.scenarios.map((s) => s.id),
    status: "in_review",
    actions: [],
    gaps: [],
    sortSuggestions: [],
  };
  const evidence: Evidence[] = [];
  const processed: ProcessedScenario[] = [];

  for (const scenario of input.scenarios) {
    const artifacts = input.artifacts.filter((a) => a.scenarioId === scenario.id);
    const ctx: ScenarioContext = await buildScenarioContext(
      provider,
      base,
      input.shift,
      scenario,
      artifacts,
      input.perception,
    );
    evidence.push(...ctx.evidence);

    const plan = await trace.step(
      "route",
      `Route “${scenario.title}”`,
      () => provider.route(ctx),
      (p) => ({
        scenarioId: scenario.id,
        proposed: p.instances.map((i) => i.key),
        scores: p.scores.slice(0, 6),
      }),
    );
    const { matches, related } = await provider.match(ctx, plan);
    const targets = plan.instances.map((instance) => ({
      instance,
      match: matches.find((m) => m.instanceKey === instance.key)!,
    }));

    const drafts: DraftRecord[] = [];
    const ordered = [
      ...targets.filter((t) => t.match.decision === "create"),
      ...targets.filter((t) => t.match.decision === "update"),
    ];
    for (const t of ordered) {
      const server = servers.find((s) => s.id === t.instance.server);
      const d = await trace.step(
        "draft",
        `${t.match.decision === "create" ? "Draft new" : `Draft update to ${t.match.target!.id}:`} ${t.instance.manifest.displayName.toLowerCase()}`,
        () => provider.draft(ctx, { ...t, siblings: targets, siblingDrafts: drafts }),
        (r) => ({
          instance: t.instance.key,
          fields: Object.keys(r.fieldSupport).length,
          unresolved: r.unresolved.length,
        }),
        server ? `${server.id}.validate_record` : undefined,
      );
      drafts.push(d);
    }
    const gaps = await trace.step(
      "gaps",
      `Check “${scenario.title}” for missing details`,
      () => provider.findGaps(ctx, drafts),
      (g) => ({ questions: g.map((x) => x.question) }),
    );
    const scenarioSet = await trace.step(
      "plan",
      `Plan changes for “${scenario.title}”`,
      () => provider.plan(ctx, drafts, related, gaps),
      (cs) => ({
        actions: cs.actions.map((a) => `${a.type}${"server" in a ? ` ${a.server}` : ""}`),
      }),
    );
    changeSet.actions.push(...scenarioSet.actions);
    changeSet.gaps.push(...scenarioSet.gaps);
    processed.push({
      id: scenario.id,
      title: scenario.title,
      instances: plan.instances,
      entities: ctx.entities,
    });
  }

  // Inbox: suggest moving captures that belong to a processed scenario.
  const inbox: Parameters<typeof sortSuggestions>[0] = [];
  for (const a of input.inbox) {
    const ev = await ingestArtifact(provider, a, input.perception[a.id]);
    inbox.push({ artifact: a, evidence: ev, entities: indexEvidence(ev).entities });
  }
  changeSet.sortSuggestions = await trace.step(
    "plan",
    "Check the Inbox and scenario grouping",
    async () => sortSuggestions(inbox, processed),
    (s) => ({ suggestions: s.map((x) => x.rationale) }),
  );

  const cited = new Set<string>();
  for (const a of changeSet.actions) {
    if (a.type !== "create" && a.type !== "update") continue;
    for (const s of Object.values(a.fieldSupport)) for (const c of s.citations) cited.add(c.docId);
  }
  return {
    changeSet,
    evidence,
    knowledge: Object.fromEntries([...cited].map((id) => [id, deps.knowledge.docTitle(id)])),
    trace: {
      id: input.runId,
      provider: provider.name,
      scenarioIds: changeSet.scenarioIds,
      startedAt,
      finishedAt: localIso(),
      changeSetId: changeSet.id,
      steps,
    },
  };
}
