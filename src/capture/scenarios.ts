import type { Artifact, Modality, Scenario } from "@/domain";

/** Pure helpers for grouping captures into scenarios. The Dexie repository applies their results. */

export function defaultScenarioTitle(capturedAtIso: string): string {
  return `New scenario ${capturedAtIso.slice(11, 16)}`;
}

export interface ScenarioStats {
  count: number;
  byModality: Partial<Record<Modality, number>>;
  firstAt?: string;
  lastAt?: string;
}

export function scenarioStats(artifacts: Artifact[]): ScenarioStats {
  const byModality: Partial<Record<Modality, number>> = {};
  let firstAt: string | undefined;
  let lastAt: string | undefined;
  for (const a of artifacts) {
    byModality[a.modality] = (byModality[a.modality] ?? 0) + 1;
    if (!firstAt || a.capturedAt < firstAt) firstAt = a.capturedAt;
    if (!lastAt || a.capturedAt > lastAt) lastAt = a.capturedAt;
  }
  return { count: artifacts.length, byModality, firstAt, lastAt };
}

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(clean);
  const sentence = m ? m[1] : clean;
  return sentence.length > 140 ? `${sentence.slice(0, 137).trimEnd()}…` : sentence;
}

/**
 * One-line summary for a scenario card. Uses the stored summary when there is one (demo
 * scenarios, later the agent's), otherwise the first sentence of the earliest spoken or written
 * capture, otherwise what was captured.
 */
export function summarizeScenario(
  scenario: Pick<Scenario, "summary">,
  artifacts: Artifact[],
): string {
  if (scenario.summary) return scenario.summary;
  const ordered = [...artifacts].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const withText = ordered.find((a) => a.text?.trim() && a.modality !== "photo");
  if (withText) return firstSentence(withText.text!);
  const captioned = ordered.find((a) => a.text?.trim());
  if (captioned) return firstSentence(captioned.text!);
  if (ordered.length === 0) return "No captures yet";
  const stats = scenarioStats(ordered);
  return Object.entries(stats.byModality)
    .map(([m, n]) => `${n} ${m}${n === 1 ? "" : m === "video" ? "s" : "s"}`)
    .join(", ");
}

export interface ArtifactMove {
  id: string;
  scenarioId: string | null;
}

/** Move every artifact of `source` into `target`; the source scenario is then removed. */
export function planMerge(
  sourceId: string,
  targetId: string,
  artifacts: Artifact[],
): ArtifactMove[] {
  if (sourceId === targetId) throw new Error("Cannot merge a scenario into itself");
  return artifacts
    .filter((a) => a.scenarioId === sourceId)
    .map((a) => ({ id: a.id, scenarioId: targetId }));
}

/** Split selected artifacts of a scenario into a new scenario. At least one must stay behind. */
export function planSplit(
  sourceId: string,
  selectedIds: string[],
  artifacts: Artifact[],
  newScenarioId: string,
): ArtifactMove[] {
  const inSource = artifacts.filter((a) => a.scenarioId === sourceId);
  const selected = new Set(selectedIds);
  const moving = inSource.filter((a) => selected.has(a.id));
  if (moving.length === 0) throw new Error("Select at least one capture to split off");
  if (moving.length === inSource.length)
    throw new Error("Leave at least one capture in the original scenario");
  return moving.map((a) => ({ id: a.id, scenarioId: newScenarioId }));
}
