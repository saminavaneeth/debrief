import type { Artifact, Evidence, PerceptionFixture } from "@/domain";
import type { Gazetteer } from "../nlp/gazetteer";
import { sentences } from "../nlp/text";

/**
 * Perception in demo mode: converts what a speech, vision or document model returned (fixtures
 * for demo captures, on-device transcripts/OCR/PDF text for the user's own) into Evidence with
 * provenance. Downstream steps never care which modality a fact came from.
 */

type EvidenceSource = Evidence["source"];

class Builder {
  readonly out: Evidence[] = [];
  private n = 0;
  constructor(
    private readonly artifact: Artifact,
    private readonly gazetteer: Gazetteer,
  ) {}

  add(e: Omit<Evidence, "id" | "artifactId" | "modality">): Evidence {
    const ev = {
      id: `${this.artifact.id}:e${++this.n}`,
      artifactId: this.artifact.id,
      modality: this.artifact.modality,
      ...e,
    } as Evidence;
    this.out.push(ev);
    return ev;
  }

  /** Statements (one per sentence) plus entity mentions found in them. */
  text(
    text: string,
    spanType: "transcript_span" | "text_span",
    source: EvidenceSource,
    confidence: number,
  ) {
    for (const s of sentences(text)) {
      this.add({
        kind: "statement",
        text: s.text,
        provenance: { type: spanType, start: s.start, end: s.end },
        confidence,
        source,
      });
    }
    for (const m of this.gazetteer.find(text)) {
      this.add({
        kind: "entity",
        text: m.surface,
        label: m.type,
        value: m.id,
        provenance: { type: spanType, start: m.start, end: m.end },
        confidence: Math.min(confidence, 0.95),
        source,
      });
    }
  }

  /** Entities read off an image (asset tags, sign text). */
  imageText(text: string, frameMs?: number) {
    const box = { x: 0, y: 0, w: 1, h: 1 };
    this.add({
      kind: "ocr_text",
      text: text.replace(/\s+/g, " ").trim(),
      provenance: { type: "image_region", box, ...(frameMs !== undefined ? { frameMs } : {}) },
      confidence: 0.85,
      source: "ocr",
    });
    for (const m of this.gazetteer.find(text)) {
      this.add({
        kind: "entity",
        text: m.surface,
        label: m.type,
        value: m.id,
        provenance: { type: "image_region", box, ...(frameMs !== undefined ? { frameMs } : {}) },
        confidence: 0.85,
        source: "ocr",
      });
    }
  }

  metadata() {
    const a = this.artifact;
    this.add({
      kind: "metadata",
      text: `Captured ${a.capturedAt}`,
      label: "capturedAt",
      value: a.capturedAt,
      provenance: { type: "capture_metadata", field: "capturedAt" },
      confidence: 1,
      source: "capture",
    });
    this.add({
      kind: "metadata",
      text: `Captured by ${a.capturedBy}`,
      label: "capturedBy",
      value: a.capturedBy,
      provenance: { type: "capture_metadata", field: "capturedBy" },
      confidence: 1,
      source: "capture",
    });
    this.add({
      kind: "metadata",
      text: `Site ${a.siteId}`,
      label: "siteId",
      value: a.siteId,
      provenance: { type: "capture_metadata", field: "siteId" },
      confidence: 0.9,
      source: "capture",
    });
    if (a.areaId)
      this.add({
        kind: "metadata",
        text: `Area ${a.areaId}`,
        label: "areaId",
        value: a.areaId,
        provenance: { type: "capture_metadata", field: "areaId" },
        confidence: 0.9,
        source: "capture",
      });
    if (a.assetTag)
      this.add({
        kind: "entity",
        text: a.assetTag,
        label: "asset",
        value: a.assetTag,
        provenance: { type: "capture_metadata", field: "assetTag" },
        confidence: 0.95,
        source: "capture",
      });
    for (const tag of a.tags)
      this.add({
        kind: "metadata",
        text: `Tagged ${tag}`,
        label: `tag:${tag}`,
        value: tag,
        provenance: { type: "capture_metadata", field: "tags" },
        confidence: 0.8,
        source: "user_tag",
      });
  }
}

function textSource(a: Artifact): EvidenceSource {
  switch (a.textSource) {
    case "speech_api":
      return "speech_api";
    case "fixture":
      return "fixture";
    default:
      return "user_edit";
  }
}

/** Voice: the transcript (the user's edited text wins over the recognizer's or fixture's). */
export function transcriptEvidence(
  artifact: Artifact,
  perception: PerceptionFixture | undefined,
  gazetteer: Gazetteer,
): Evidence[] {
  const b = new Builder(artifact, gazetteer);
  const fixture = perception?.kind === "transcript" ? perception.text : undefined;
  const edited = artifact.text && artifact.textSource !== "fixture" ? artifact.text : undefined;
  const text = edited ?? fixture ?? artifact.text;
  if (text)
    b.text(text, "transcript_span", edited ? textSource(artifact) : "fixture", edited ? 0.9 : 0.92);
  b.metadata();
  return b.out;
}

export function noteEvidence(artifact: Artifact, gazetteer: Gazetteer): Evidence[] {
  const b = new Builder(artifact, gazetteer);
  if (artifact.text)
    b.text(
      artifact.text,
      "text_span",
      artifact.textSource === "fixture" ? "fixture" : "user_edit",
      0.95,
    );
  b.metadata();
  return b.out;
}

export function imageEvidence(
  artifact: Artifact,
  perception: PerceptionFixture | undefined,
  gazetteer: Gazetteer,
): Evidence[] {
  const b = new Builder(artifact, gazetteer);
  if (perception?.kind === "image") {
    for (const f of perception.findings) {
      b.add({
        kind: "image_finding",
        text: f.text,
        label: f.label,
        provenance: { type: "image_region", box: f.box },
        confidence: f.confidence,
        source: "fixture",
      });
    }
    if (perception.ocrText) b.imageText(perception.ocrText);
  }
  // A caption is the user describing the photo.
  if (artifact.text) b.text(artifact.text, "text_span", "user_edit", 0.9);
  b.metadata();
  return b.out;
}

export function videoEvidence(
  artifact: Artifact,
  perception: PerceptionFixture | undefined,
  gazetteer: Gazetteer,
): Evidence[] {
  const b = new Builder(artifact, gazetteer);
  if (perception?.kind === "video") {
    for (const k of perception.keyframes) {
      for (const f of k.findings) {
        b.add({
          kind: "image_finding",
          text: f.text,
          label: f.label,
          provenance: { type: "image_region", box: f.box, frameMs: k.atMs },
          confidence: f.confidence,
          source: "fixture",
        });
      }
    }
  }
  const edited = artifact.text && artifact.textSource !== "fixture" ? artifact.text : undefined;
  const transcript =
    edited ?? (perception?.kind === "video" ? perception.transcript : undefined) ?? artifact.text;
  if (transcript)
    b.text(transcript, "transcript_span", edited ? textSource(artifact) : "fixture", 0.9);
  b.metadata();
  return b.out;
}

/* ------------------------------------------------------------------ documents */

const KEY_VALUE = /([A-Z][A-Za-z ]{1,24}):\s*(.+?)(?=\s{2,}[A-Z][A-Za-z ]{1,24}:|$)/g;

/**
 * Generic form parsing: `Label: value` pairs (several per line), pipe tables with a header row,
 * and numbered rows under a `#` header (sign-in sheets).
 */
export function documentEvidence(
  artifact: Artifact,
  perception: PerceptionFixture | undefined,
  gazetteer: Gazetteer,
): Evidence[] {
  const b = new Builder(artifact, gazetteer);
  const text = perception?.kind === "document" ? perception.text : artifact.text;
  const source: EvidenceSource =
    perception?.kind === "document" && perception.source === "image" ? "ocr" : "pdf_text";
  if (!text) {
    b.metadata();
    return b.out;
  }
  const lines = text.split("\n");
  let pipeHeader: string[] | null = null;
  let numberedHeader: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const excerpt = trimmed;

    if (trimmed.includes(" | ")) {
      const cells = trimmed.split("|").map((c) => c.trim());
      if (!pipeHeader) {
        pipeHeader = cells.map((c) => c.toLowerCase());
        continue;
      }
      if (cells.length !== pipeHeader.length) continue;
      const record = Object.fromEntries(pipeHeader.map((h, i) => [h, cells[i]]));
      const readable = pipeHeader.map((h, i) => `${h}: ${cells[i] || "—"}`).join(" · ");
      b.add({
        kind: "document_field",
        text: readable,
        label: "row",
        value: JSON.stringify(record),
        provenance: { type: "document_field", page: 1, field: `row:${cells[0]}`, excerpt },
        confidence: 0.95,
        source,
      });
      for (const m of gazetteer.find(trimmed)) {
        b.add({
          kind: "entity",
          text: m.surface,
          label: m.type,
          value: m.id,
          provenance: { type: "document_field", page: 1, field: `row:${cells[0]}`, excerpt },
          confidence: 0.95,
          source,
        });
      }
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      numberedHeader = trimmed
        .split(/\s{2,}/)
        .map((c) => c.replace(/^#\s*/, "").toLowerCase())
        .filter(Boolean);
      continue;
    }
    const numbered = /^(\d+)\s+(.+?)(?:\s{2,}(.+))?$/.exec(trimmed);
    if (numbered && numberedHeader) {
      const [, n, first, second] = numbered;
      const record: Record<string, string> = {
        "#": n,
        [numberedHeader[0] ?? "name"]: first.trim(),
      };
      if (second && numberedHeader[1]) record[numberedHeader[1]] = second.trim();
      b.add({
        kind: "document_field",
        text: `Row ${n}: ${first.trim()}${second ? ` (${second.trim()})` : ""}`,
        label: "row",
        value: JSON.stringify(record),
        provenance: { type: "document_field", page: 1, field: `row:${n}`, excerpt },
        confidence: source === "ocr" ? 0.85 : 0.95,
        source,
      });
      continue;
    }

    let kv: RegExpExecArray | null;
    let anyKv = false;
    KEY_VALUE.lastIndex = 0;
    while ((kv = KEY_VALUE.exec(trimmed))) {
      anyKv = true;
      const key = kv[1].trim().toLowerCase();
      const value = kv[2].trim();
      b.add({
        kind: "document_field",
        text: `${kv[1].trim()}: ${value}`,
        label: key,
        value,
        provenance: { type: "document_field", page: 1, field: key, excerpt },
        confidence: 0.95,
        source,
      });
      for (const m of gazetteer.find(value)) {
        b.add({
          kind: "entity",
          text: m.surface,
          label: m.type,
          value: m.id,
          provenance: { type: "document_field", page: 1, field: key, excerpt },
          confidence: 0.9,
          source,
        });
      }
    }
    if (!anyKv) {
      b.add({
        kind: "statement",
        text: trimmed,
        provenance: { type: "document_field", page: 1, field: "text", excerpt },
        confidence: 0.9,
        source,
      });
    }
  }
  b.metadata();
  return b.out;
}
