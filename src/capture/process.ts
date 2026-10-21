"use client";

import type { Artifact, ChangeSet, Evidence, RunTrace, TraceStep } from "@/domain";
import { localIso } from "@/lib/time";
import { getDb, type RunRow } from "./db";
import { ensurePerception } from "./device-perception";

export interface ProcessResult {
  changeSet: ChangeSet;
  evidence: Evidence[];
  trace: RunTrace;
  knowledge: Record<string, string>;
}

/** Read an SSE response body, calling `onEvent` for each event. */
async function readEvents(res: Response, onEvent: (event: string, data: unknown) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.+)$/m.exec(chunk)?.[1] ?? "message";
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}

/**
 * Process scenarios: gather captures and perception from this device, stream the run trace from
 * the server, and store the proposed change set for review.
 */
export async function processScenarios(
  scenarioIds: string[],
  opts: { animate: boolean; onStep: (s: TraceStep) => void; onPreparing?: (a: Artifact) => void },
): Promise<RunRow> {
  const db = getDb();
  // Oldest first, so records are numbered in the order things happened.
  const scenarios = (await db.scenarios.bulkGet(scenarioIds))
    .filter((s) => !!s)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  if (scenarios.length === 0) throw new Error("No scenarios selected");
  const shift = await db.shifts.get(scenarios[0].shiftId);
  if (!shift) throw new Error("Shift not found");
  const shiftArtifacts = await db.artifacts.where("shiftId").equals(shift.id).sortBy("capturedAt");
  const artifacts = shiftArtifacts.filter(
    (a) => a.scenarioId && scenarioIds.includes(a.scenarioId),
  );
  const inbox = shiftArtifacts.filter((a) => a.scenarioId === null);
  const perception = await ensurePerception([...artifacts, ...inbox], opts.onPreparing);

  await db.scenarios.bulkUpdate(
    scenarios.map((s) => ({ key: s.id, changes: { status: "processing" as const } })),
  );
  let result: ProcessResult | undefined;
  let failure: string | undefined;
  try {
    const res = await fetch("/api/agent/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shift,
        scenarios,
        artifacts,
        inbox,
        perception,
        stepDelayMs: opts.animate ? 220 : 0,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Processing failed (${res.status})`);
    await readEvents(res, (event, data) => {
      if (event === "step") opts.onStep(data as TraceStep);
      if (event === "result") result = data as ProcessResult;
      if (event === "error") failure = (data as { message: string }).message;
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  if (!result) {
    await db.scenarios.bulkUpdate(
      scenarios.map((s) => ({ key: s.id, changes: { status: s.status } })),
    );
    throw new Error(failure ?? "Processing returned no result");
  }

  const run: RunRow = {
    id: result.changeSet.id,
    createdAt: localIso(),
    scenarioIds,
    status: "in_review",
    changeSet: result.changeSet,
    evidence: result.evidence,
    trace: result.trace,
    knowledge: result.knowledge,
  };
  await db.runs.put(run);
  await db.scenarios.bulkUpdate(
    scenarios.map((s) => ({
      key: s.id,
      changes: { status: "in_review" as const, updatedAt: localIso() },
    })),
  );
  return run;
}

export async function saveChangeSet(runId: string, changeSet: ChangeSet) {
  await getDb().runs.update(runId, { changeSet });
}

/** Push the approved actions of a run through the gateway and record the results. */
export async function pushRun(runId: string): Promise<RunRow> {
  const db = getDb();
  const run = await db.runs.get(runId);
  if (!run) throw new Error("Run not found");
  const artifacts = await db.artifacts.bulkGet(
    run.changeSet.actions.flatMap((a) => (a.type === "attach" ? [a.artifactId] : [])),
  );
  const media = Object.fromEntries(
    artifacts
      .filter((a): a is Artifact => !!a)
      .map((a) => [
        a.id,
        {
          modality: a.modality,
          ...(a.media ? { uri: a.media.uri } : {}),
          ...(a.text ? { caption: a.text.slice(0, 200) } : {}),
        },
      ]),
  );
  const res = await fetch("/api/agent/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changeSet: run.changeSet, artifacts: media }),
  });
  if (!res.ok) throw new Error(`Push failed (${res.status})`);
  const report = (await res.json()) as { changeSet: ChangeSet; results: RunRow["results"] };
  const status = report.changeSet.status === "pushed" ? "pushed" : "partially_pushed";
  const updated: RunRow = {
    ...run,
    changeSet: report.changeSet,
    results: report.results,
    status,
    pushedAt: localIso(),
  };
  await db.runs.put(updated);
  for (const scenarioId of run.scenarioIds) {
    const mine = report.changeSet.actions.filter(
      (a) => a.scenarioId === scenarioId && a.status !== "rejected",
    );
    if (mine.length && mine.every((a) => a.status === "executed")) {
      await db.scenarios.update(scenarioId, { status: "pushed", updatedAt: localIso() });
    }
  }
  return updated;
}
