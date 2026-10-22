import {
  type Artifact,
  type PerceptionFixture,
  type Scenario,
  type ScenarioFixture,
  type Shift,
} from "@/domain";

export interface PerceptionRow {
  artifactId: string;
  /** `fixture`: demo perception; `device`: transcripts, OCR and PDF text read on this device. */
  source: "fixture" | "device";
  /** Scenario fixture the perception came from, e.g. `S1`. */
  fixtureId?: string;
  perception: PerceptionFixture;
}

export interface DemoDay {
  shift: Shift;
  scenarios: Scenario[];
  artifacts: Artifact[];
  perception: PerceptionRow[];
  /** Public URLs to warm into the offline cache. */
  assetUrls: string[];
}

/**
 * Build the local rows for "Load demo day" from the S1–S6 fixtures: one shift, the fixture
 * scenarios (ready to process, with the fixture summary as the card line), every artifact with
 * its transcript as editable text, and the perception fixtures the demo engine reads in Phase 4.
 */
export function buildDemoDay(fixtures: ScenarioFixture[]): DemoDay {
  if (fixtures.length === 0) throw new Error("No demo fixtures");
  const shift = fixtures[0].shift;
  for (const f of fixtures) {
    if (f.shift.id !== shift.id)
      throw new Error(`${f.id} belongs to a different shift (${f.shift.id})`);
  }

  const scenarios: Scenario[] = [];
  const artifacts: Artifact[] = [];
  const perception: PerceptionRow[] = [];
  const assetUrls = new Set<string>();

  for (const f of fixtures) {
    for (const s of f.scenarios) scenarios.push({ ...s, summary: s.summary ?? f.summary });
    for (const a of f.artifacts) {
      const p = f.perception[a.id];
      const transcript =
        p?.kind === "transcript" ? p.text : p?.kind === "video" ? p.transcript : undefined;
      const text = a.text ?? transcript;
      artifacts.push({
        ...a,
        ...(text !== undefined ? { text, textSource: "fixture" as const } : {}),
      });
      if (p)
        perception.push({ artifactId: a.id, source: "fixture", fixtureId: f.id, perception: p });
      // Demo voice notes and the video have no media files yet (speech synthesis and keyframes
      // stand in), so only images and documents are warmed.
      if (a.media && a.modality !== "voice" && a.modality !== "video") assetUrls.add(a.media.uri);
      if (p?.kind === "video") for (const k of p.keyframes) assetUrls.add(k.uri);
    }
  }

  artifacts.sort((x, y) => x.capturedAt.localeCompare(y.capturedAt) || x.id.localeCompare(y.id));
  scenarios.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  return { shift, scenarios, artifacts, perception, assetUrls: [...assetUrls].sort() };
}
