import { z } from "zod";
import { IsoDateTime } from "./common";

export const RunStage = z.enum(["ingest", "route", "match", "draft", "gaps", "plan", "push"]);

export const TraceStep = z.strictObject({
  id: z.string(),
  stage: RunStage,
  label: z.string(),
  startedAt: IsoDateTime,
  durationMs: z.number().nonnegative(),
  status: z.enum(["running", "ok", "warning", "error"]),
  /** Namespaced tool, e.g. `incidents.search_records`, when the step is a tool call. */
  tool: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
});

/** The log of every agent step and tool call for one processing run. */
export const RunTrace = z.strictObject({
  id: z.string(),
  provider: z.enum(["demo", "llm"]),
  scenarioIds: z.array(z.string()),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.optional(),
  changeSetId: z.string().optional(),
  steps: z.array(TraceStep),
});

export type RunStage = z.infer<typeof RunStage>;
export type TraceStep = z.infer<typeof TraceStep>;
export type RunTrace = z.infer<typeof RunTrace>;
