import type { Evidence } from "@/domain";
import { findTimes, minutesToClock, parseDate } from "../nlp/numbers";
import { matchedKeywords, truncate } from "../nlp/text";
import type { RouteInstance, ScenarioContext } from "../types";
import { contentText, entitiesIn, isContent } from "./scope";

export interface Supported<T> {
  value: T;
  evidenceIds: string[];
  rule?: string;
}

const iso = (ctx: ScenarioContext, date: string, minutes: number) =>
  `${date}T${minutesToClock(minutes)}:00${ctx.utcOffset}`;

/**
 * When it happened: labelled document date/time, else the earliest spoken or written time on the
 * shift date, else the earliest capture time.
 */
export function eventTime(
  ctx: ScenarioContext,
  evidence: Evidence[],
  documentFields?: { date: string; time: string },
): Supported<string> {
  if (documentFields) {
    const d = ctx.documentFields.get(documentFields.date);
    const t = ctx.documentFields.get(documentFields.time);
    const date = d && typeof d.value === "string" ? parseDate(d.value) : undefined;
    const time = t && typeof t.value === "string" ? findTimes(t.value)[0] : undefined;
    if (time) {
      return {
        value: iso(ctx, date ?? ctx.date, time.minutes),
        evidenceIds: [d?.id, t?.id].filter(Boolean) as string[],
        rule: "date and time on the form",
      };
    }
  }
  let best: { minutes: number; evidenceId: string } | undefined;
  for (const e of evidence) {
    if (e.kind !== "statement") continue;
    for (const t of findTimes(e.text)) {
      if (!best || t.minutes < best.minutes) best = { minutes: t.minutes, evidenceId: e.id };
    }
  }
  if (best)
    return {
      value: iso(ctx, ctx.date, best.minutes),
      evidenceIds: [best.evidenceId],
      rule: "time mentioned",
    };

  const captured = evidence
    .filter((e) => e.kind === "metadata" && e.label === "capturedAt")
    .sort((a, b) => String(a.value).localeCompare(String(b.value)));
  const first =
    captured[0] ?? ctx.evidence.find((e) => e.kind === "metadata" && e.label === "capturedAt");
  return {
    value: String(first?.value ?? `${ctx.date}T00:00:00${ctx.utcOffset}`),
    evidenceIds: first ? [first.id] : [],
    rule: "capture time",
  };
}

/** Area named in the evidence, else the subject asset's area, else where it was captured. */
export function primaryArea(
  ctx: ScenarioContext,
  evidence: Evidence[],
  subjectAssets: string[] = [],
): { id: string; evidenceIds: string[]; rule: string } | undefined {
  const ids = new Set(evidence.map((e) => e.id));
  const counts = new Map<string, string[]>();
  for (const m of ctx.entities) {
    if (m.type !== "area" || !ids.has(m.evidenceId)) continue;
    counts.set(m.id, [...(counts.get(m.id) ?? []), m.evidenceId]);
  }
  const named = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (named) return { id: named[0], evidenceIds: named[1], rule: "area named" };

  for (const a of subjectAssets) {
    const asset = ctx.org.assets.get(a);
    const support = ctx.entities
      .filter((m) => m.type === "asset" && m.id === a && ids.has(m.evidenceId))
      .map((m) => m.evidenceId);
    if (asset) return { id: asset.areaId, evidenceIds: support, rule: `location of ${a}` };
  }

  const meta = evidence.filter((e) => e.kind === "metadata" && e.label === "areaId");
  const byArea = new Map<string, string[]>();
  for (const e of meta) byArea.set(String(e.value), [...(byArea.get(String(e.value)) ?? []), e.id]);
  const captured = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (captured) return { id: captured[0], evidenceIds: captured[1], rule: "capture location" };
  if (ctx.scenario.areaId)
    return { id: ctx.scenario.areaId, evidenceIds: [], rule: "scenario area" };
  return undefined;
}

/** True for document header lines such as "CEDAR VALLEY MANUFACTURING". */
const isHeading = (e: Evidence) =>
  e.kind === "statement" &&
  e.provenance.type === "document_field" &&
  e.text === e.text.toUpperCase();

/**
 * The key finding or statement an instance is about: for condition records (and record types
 * whose routing lists the finding's category) the most confident image finding; otherwise the
 * statement with the most routing keywords.
 */
export function primaryEvidence(
  ctx: ScenarioContext,
  instance: RouteInstance,
  evidence: Evidence[],
): Evidence | undefined {
  const findings = evidence
    .filter((e) => e.kind === "image_finding" && e.label && ctx.knowledge.category(e.label))
    .filter(
      (e) =>
        instance.manifest.matching.strategy === "condition" ||
        instance.manifest.routing.categories.includes(e.label!),
    )
    .sort((a, b) => b.confidence - a.confidence);
  if (findings[0]) return findings[0];
  const statements = evidence.filter(
    (e) =>
      (e.kind === "statement" && !isHeading(e)) ||
      (e.kind === "document_field" && e.label === "row"),
  );
  let best: Evidence | undefined;
  let bestHits = 0;
  for (const s of statements) {
    const hits = matchedKeywords(contentText(s), instance.manifest.routing.keywords).length;
    if (hits > bestHits) {
      best = s;
      bestHits = hits;
    }
  }
  return best ?? statements[0];
}

/** Readable text for a piece of evidence (rows show their notes or values). */
export function readable(e: Evidence): string {
  if (e.kind === "document_field" && e.label === "row" && typeof e.value === "string") {
    const cells = JSON.parse(e.value) as Record<string, string>;
    const notes = Object.entries(cells).find(([k]) => /note|comment|remark/.test(k))?.[1];
    return notes || Object.values(cells).filter(Boolean).join(", ");
  }
  return e.text;
}

/** Plain-language account: statements in capture order, else findings and row notes. */
export function description(evidence: Evidence[], max = 600): Supported<string> | undefined {
  const parts: { text: string; id: string }[] = [];
  const seen = new Set<string>();
  const push = (e: Evidence, text: string) => {
    const key = text.toLowerCase();
    if (!text.trim() || seen.has(key)) return;
    seen.add(key);
    parts.push({ text: /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`, id: e.id });
  };
  for (const e of evidence) if (e.kind === "statement" && !isHeading(e)) push(e, e.text);
  if (parts.length === 0) {
    for (const e of evidence) {
      if (e.kind === "image_finding" && e.label !== "asset_tag") push(e, e.text);
      if (e.kind === "document_field" && e.label === "row") push(e, readable(e));
    }
  }
  if (parts.length === 0) return undefined;
  let text = "";
  const ids: string[] = [];
  for (const p of parts) {
    if (text.length + p.text.length > max) break;
    text = text ? `${text} ${p.text}` : p.text;
    ids.push(p.id);
  }
  return {
    value: text || truncate(parts[0].text, max),
    evidenceIds: ids.length ? ids : [parts[0].id],
  };
}

/** Persons mentioned in the same sentence as a piece of evidence (excluding the capturer). */
export function peopleIn(ctx: ScenarioContext, e: Evidence) {
  const capturer = ctx.shift.userId;
  return entitiesIn(ctx, e).filter((m) => m.type === "person" && m.id !== capturer);
}

export { isContent };
