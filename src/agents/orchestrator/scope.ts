import type { Evidence } from "@/domain";
import { findKeywords, matchedKeywords } from "../nlp/text";
import type { EntityMention, RouteInstance, ScenarioContext } from "../types";

/** Evidence that carries content (not entity or capture metadata records). */
export const isContent = (e: Evidence) =>
  e.kind === "statement" ||
  e.kind === "image_finding" ||
  e.kind === "document_field" ||
  e.kind === "ocr_text";

/** Text used for keyword matching; document rows are matched on their cell values. */
export function contentText(e: Evidence): string {
  if (e.kind === "document_field" && e.label === "row" && typeof e.value === "string") {
    return Object.values(JSON.parse(e.value) as Record<string, string>).join(" · ");
  }
  return e.text;
}

function spanOf(e: Evidence): { start: number; end: number } | null {
  const p = e.provenance;
  return p.type === "transcript_span" || p.type === "text_span"
    ? { start: p.start, end: p.end }
    : null;
}

function sameRegion(a: Evidence, b: Evidence): boolean {
  if (a.artifactId !== b.artifactId) return false;
  const sa = spanOf(a);
  const sb = spanOf(b);
  if (sa && sb) return sb.start >= sa.start && sb.end <= sa.end;
  const pa = a.provenance;
  const pb = b.provenance;
  if (pa.type === "document_field" && pb.type === "document_field") return pa.field === pb.field;
  // Image findings, OCR and capture metadata describe the whole artifact.
  return (
    (pa.type === "image_region" || pa.type === "capture_metadata") &&
    (pb.type === "image_region" || pb.type === "capture_metadata")
  );
}

/** Entities mentioned in (or attached to) a piece of content evidence. */
export function entitiesIn(ctx: ScenarioContext, e: Evidence): EntityMention[] {
  const byId = new Map(ctx.evidence.map((x) => [x.id, x]));
  return ctx.entities.filter((m) => {
    const ev = byId.get(m.evidenceId)!;
    if (sameRegion(e, ev)) return true;
    // An asset tag on the capture applies to everything in that capture.
    return (
      ev.provenance.type === "capture_metadata" &&
      ev.artifactId === e.artifactId &&
      m.type === "asset"
    );
  });
}

/** Hazard taxonomy categories supported by some evidence, best first. */
export function categoryScores(
  ctx: ScenarioContext,
  evidence: Evidence[],
): { id: string; score: number; evidenceIds: string[] }[] {
  const scores = new Map<string, { score: number; evidenceIds: Set<string> }>();
  const bump = (id: string, by: number, evId: string) => {
    const s = scores.get(id) ?? { score: 0, evidenceIds: new Set() };
    s.score += by;
    s.evidenceIds.add(evId);
    scores.set(id, s);
  };
  for (const c of ctx.knowledge.taxonomy.categories) {
    const distinct = new Map<string, string>();
    for (const e of evidence.filter(isContent)) {
      for (const k of matchedKeywords(contentText(e), c.keywords))
        if (!distinct.has(k)) distinct.set(k, e.id);
    }
    for (const evId of distinct.values()) bump(c.id, 1, evId);
  }
  for (const e of evidence) {
    if (e.kind === "image_finding" && e.label && ctx.knowledge.category(e.label))
      bump(e.label, 2, e.id);
    if (e.kind === "metadata" && e.label?.startsWith("tag:") && typeof e.value === "string")
      bump(e.value, 2, e.id);
  }
  return [...scores.entries()]
    .map(([id, s]) => ({ id, score: s.score, evidenceIds: [...s.evidenceIds] }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Evidence in scope for drafting one instance, with its metadata and entity records. */
export function instanceEvidence(ctx: ScenarioContext, instance: RouteInstance): Evidence[] {
  const ids = new Set(instance.evidenceIds);
  return ctx.evidence.filter((e) => ids.has(e.id));
}

export function keywordEvidence(
  evidence: Evidence[],
  keywords: readonly string[],
  skipNegated: boolean,
) {
  const out: { evidence: Evidence; keyword: string }[] = [];
  for (const e of evidence.filter(isContent)) {
    for (const h of findKeywords(contentText(e), keywords)) {
      if (skipNegated && h.negated) continue;
      out.push({ evidence: e, keyword: h.keyword });
    }
  }
  return out;
}
