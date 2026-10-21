import type { Evidence, KnowledgeCitation } from "@/domain";
import { findKeywords } from "../nlp/text";
import type { ScenarioContext } from "../types";
import { contentText, isContent } from "./scope";

/**
 * EHS classification rules referenced by name from schema `x-fill` directives. They know about
 * injuries and severity, not about any particular module.
 */

export interface RuleResult<T> {
  value: T;
  evidenceIds: string[];
  rule: string;
  citations?: KnowledgeCitation[];
}

function cueHits(evidence: Evidence[], cues: readonly string[]) {
  const out: { evidence: Evidence; keyword: string; start: number; end: number }[] = [];
  for (const e of evidence.filter(isContent)) {
    const text = contentText(e);
    for (const h of findKeywords(text, cues))
      if (!h.negated) out.push({ evidence: e, keyword: h.keyword, start: h.start, end: h.end });
  }
  return out;
}

const BODY_PARTS = [
  "knee",
  "ankle",
  "wrist",
  "hand",
  "finger",
  "fingers",
  "thumb",
  "arm",
  "elbow",
  "shoulder",
  "lower back",
  "neck",
  "head",
  "eye",
  "foot",
  "toe",
  "leg",
  "hip",
];
const NATURE: [string, string[]][] = [
  ["bruise", ["bruise", "bruised", "contusion", "banged up"]],
  ["laceration", ["cut", "laceration", "gash"]],
  ["strain", ["strain", "strained", "pulled"]],
  ["sprain", ["sprain", "sprained", "twisted"]],
  ["burn", ["burn", "burned", "burnt"]],
  ["heat illness symptoms", ["heat exhaustion", "dizzy", "dizziness"]],
];
const TREATMENT: [string, string[]][] = [
  ["days_away", ["days off", "sent home", "off work"]],
  ["restricted_work", ["light duty", "restricted duty", "restricted work"]],
  ["medical_treatment", ["stitches", "sutures", "prescription", "clinic", "urgent care", "x ray"]],
  [
    "first_aid",
    [
      "ice pack",
      "cold pack",
      "first aid",
      "bandage",
      "band aid",
      "cleaned the cut",
      "water and rest",
    ],
  ],
];
const RETURNED = [
  "back to work",
  "went back to work",
  "returned to work",
  "returned to normal duty",
  "finished the shift",
  "back on the line",
];

/** Injury details: body part (with side), nature, treatment and return to work. */
export function injury(
  evidence: Evidence[],
):
  | RuleResult<{ bodyPart: string; nature: string; treatment: string; returnedToWork: boolean }>
  | undefined {
  const ids = new Set<string>();
  let bodyPart: string | undefined;
  for (const h of cueHits(evidence, BODY_PARTS)) {
    const text = contentText(h.evidence).toLowerCase();
    const side = /\b(right|left)\s+$/.exec(text.slice(Math.max(0, h.start - 7), h.start))?.[1];
    bodyPart = side ? `${side} ${h.keyword}` : h.keyword;
    ids.add(h.evidence.id);
    break;
  }
  const pick = (table: [string, string[]][]) => {
    for (const [value, cues] of table) {
      const hit = cueHits(evidence, cues)[0];
      if (hit) {
        ids.add(hit.evidence.id);
        return value;
      }
    }
    return undefined;
  };
  const nature = pick(NATURE);
  const treatment = pick(TREATMENT);
  const returned = cueHits(evidence, RETURNED)[0];
  if (returned) ids.add(returned.evidence.id);
  if (!bodyPart || !nature || !treatment) return undefined;
  return {
    value: { bodyPart, nature, treatment, returnedToWork: !!returned && treatment !== "days_away" },
    evidenceIds: [...ids],
    rule: "injury details from body part, injury and treatment words",
  };
}

/** OSHA recordability from treatment, citing the 29 CFR 1904.7 first-aid list. */
export function recordability(
  ctx: ScenarioContext,
  inj: { treatment: string; returnedToWork: boolean } | undefined,
  supportIds: string[],
  evidence: Evidence[],
): { recordable: RuleResult<boolean>; basis: RuleResult<string> } | undefined {
  if (!inj) return undefined;
  const firstAid = inj.treatment === "first_aid" && inj.returnedToWork;
  const treatmentText = evidence.filter(isContent).map(contentText).join(" ").toLowerCase();
  const query = firstAid
    ? `first aid list ${/ice pack|cold pack/.test(treatmentText) ? "hot or cold therapy ice pack" : treatmentText.slice(0, 120)}`
    : "medical treatment beyond first aid days away restricted work recordable";
  const hit = ctx.knowledge.query(query, { docIds: ["osha-1904-7"], limit: 1 })[0];
  const citations = hit ? [ctx.knowledge.citation(hit)] : [];
  const para = hit ? /(\d{4}\.\d+(?:\([a-z0-9]+\))*)/i.exec(hit.chunk.section)?.[1] : undefined;
  const item = hit ? /^\(([A-Z])\)\s+(.+)$/.exec(hit.excerpt) : null;
  const ref = para ? `29 CFR ${para}${item ? `(${item[1]})` : ""}` : "29 CFR 1904.7";
  const basis = firstAid
    ? `First aid only${item ? `: ${item[2].replace(/\s*\(.*?\)\s*$/, "").toLowerCase()}` : ""} (${ref}); returned to normal duties.`
    : `Treatment beyond first aid (${inj.treatment.replaceAll("_", " ")}) — recordable under ${ref}.`;
  const rule = firstAid ? "first aid only per the 1904.7 list" : "treatment beyond first aid";
  return {
    recordable: { value: !firstAid, evidenceIds: supportIds, rule, citations },
    basis: { value: basis, evidenceIds: supportIds, rule, citations },
  };
}

/** Incident severity from what happened and the treatment given. */
export function incidentSeverity(
  incidentType: string | undefined,
  treatment: string | undefined,
): { value: number; rule: string } | undefined {
  if (!incidentType) return undefined;
  if (incidentType === "injury" || incidentType === "illness") {
    const byTreatment: Record<string, number> = {
      none: 1,
      first_aid: 2,
      medical_treatment: 3,
      restricted_work: 3,
      days_away: 4,
    };
    if (!treatment) return undefined;
    return {
      value: byTreatment[treatment] ?? 3,
      rule: `${incidentType} with ${treatment.replaceAll("_", " ")}`,
    };
  }
  const byType: Record<string, number> = { near_miss: 3, property_damage: 2, environmental: 2 };
  return {
    value: byType[incidentType] ?? 2,
    rule: `${incidentType.replaceAll("_", " ")} (credible potential)`,
  };
}

const RISK_SEVERITY: Record<string, number> = { low: 2, medium: 3, high: 4, critical: 4 };

export function riskFromCategory(ctx: ScenarioContext, category: string | undefined) {
  const c = category ? ctx.knowledge.category(category) : undefined;
  return c ? { value: c.defaultRisk, rule: `default risk for ${c.name}` } : undefined;
}

export function severityFromCategory(
  ctx: ScenarioContext,
  category: string | undefined,
  evidence: Evidence[],
) {
  const risk = riskFromCategory(ctx, category);
  if (!risk) return undefined;
  const fatal = cueHits(evidence, ["fatal", "fatality", "hospitalized", "amputation"]).length > 0;
  return { value: fatal ? 5 : RISK_SEVERITY[risk.value], rule: `${risk.rule} → severity` };
}
