import type { Artifact, Evidence, PerceptionFixture, Scenario, Shift } from "@/domain";
import type { AgentProvider } from "../provider";
import type { DocumentTable, EntityMention, ScenarioContext } from "../types";

/** Run perception for one artifact through the provider. */
export async function ingestArtifact(
  provider: AgentProvider,
  artifact: Artifact,
  perception?: PerceptionFixture,
): Promise<Evidence[]> {
  switch (artifact.modality) {
    case "voice":
      return provider.transcribe(artifact, perception);
    case "photo":
      return provider.analyzeImage(artifact, perception);
    case "video":
      return provider.analyzeVideo(artifact, perception);
    case "document":
      return provider.extractDocument(artifact, perception);
    case "note":
      return provider.transcribe(artifact, perception);
  }
}

/** Derive entity mentions, document tables and labelled document fields from evidence. */
export function indexEvidence(evidence: Evidence[]) {
  const entities: EntityMention[] = [];
  const tables = new Map<string, DocumentTable>();
  const documentFields = new Map<string, Evidence>();
  for (const e of evidence) {
    if (e.kind === "entity" && e.label && typeof e.value === "string") {
      entities.push({
        evidenceId: e.id,
        artifactId: e.artifactId,
        type: e.label as EntityMention["type"],
        id: e.value,
        surface: e.text,
      });
    }
    if (e.kind === "document_field") {
      if (e.label === "row" && typeof e.value === "string") {
        const cells = JSON.parse(e.value) as Record<string, string>;
        const t = tables.get(e.artifactId) ?? {
          artifactId: e.artifactId,
          columns: Object.keys(cells),
          rows: [],
        };
        t.rows.push({ evidenceId: e.id, cells });
        tables.set(e.artifactId, t);
      } else if (e.label && !documentFields.has(e.label)) {
        documentFields.set(e.label, e);
      }
    }
  }
  return { entities, tables: [...tables.values()], documentFields };
}

export type ContextBase = Omit<
  ScenarioContext,
  | "scenario"
  | "artifacts"
  | "evidence"
  | "entities"
  | "tables"
  | "documentFields"
  | "shift"
  | "date"
>;

export async function buildScenarioContext(
  provider: AgentProvider,
  base: ContextBase,
  shift: Shift,
  scenario: Scenario,
  artifacts: Artifact[],
  perception: Record<string, PerceptionFixture>,
): Promise<ScenarioContext> {
  const evidence: Evidence[] = [];
  for (const a of [...artifacts].sort((x, y) => x.capturedAt.localeCompare(y.capturedAt))) {
    const ev = await base.trace.step(
      "ingest",
      `Read ${a.modality} ${a.id}`,
      () => ingestArtifact(provider, a, perception[a.id]),
      (r) => ({
        artifactId: a.id,
        modality: a.modality,
        evidence: r.length,
        scenarioId: scenario.id,
      }),
    );
    evidence.push(...ev);
  }
  return {
    ...base,
    shift,
    date: shift.date,
    scenario,
    artifacts,
    evidence,
    ...indexEvidence(evidence),
  };
}
