import type { GapQuestion } from "@/domain";
import { holds } from "@/lib/conditions";
import type { DraftRecord, GapSeed, ScenarioContext } from "../types";
import { enumOf, type JsonSchema } from "./drafter";

const isPersonField = (p: JsonSchema) =>
  [p.pattern, p.items?.pattern, ...(p.anyOf ?? []).map((a) => a.pattern)].some((x) =>
    x?.includes("[PC]"),
  );

function answerType(p: JsonSchema): GapSeed["answerType"] {
  if (isPersonField(p)) return "person";
  if (enumOf(p)) return "choice";
  if (p.type === "number" || p.type === "integer") return "number";
  if (p.format === "date") return "date";
  return "text";
}

/**
 * Questions for required values with no supporting evidence: fields in the schema's `required`
 * list or whose `x-requiredWhen` conditions hold, plus names the drafter could not resolve.
 * Nothing is guessed.
 */
export function findGaps(
  ctx: ScenarioContext,
  drafts: DraftRecord[],
): (GapSeed & { instanceKey: string })[] {
  const out: (GapSeed & { instanceKey: string })[] = [];
  for (const d of drafts) {
    out.push(...d.unresolved.map((u) => ({ ...u, instanceKey: d.instanceKey })));
    if (d.kind !== "create" || !d.payload) continue;
    const schema = ctx.servers.find((s) => s.id === d.server)?.schemas[d.recordType] as
      JsonSchema | undefined;
    const props = schema?.properties ?? {};
    const required = new Set(schema?.required ?? []);
    for (const [key, prop] of Object.entries(props)) {
      const conditional = prop["x-requiredWhen"];
      const needed =
        required.has(key) ||
        (conditional?.length && conditional.every((c) => holds(c, d.payload!)));
      if (!needed) continue;
      const v = d.payload[key];
      const missing = v === undefined || v === null || (Array.isArray(v) && v.length === 0);
      if (!missing) continue;
      const template =
        prop["x-gapQuestion"] ??
        `What is the ${(prop.description ?? key).replace(/\.$/, "").toLowerCase()}?`;
      const question = template.replace(/\{\{(\w+)\}\}/g, (_, f: string) => {
        const val = d.payload![f];
        return Array.isArray(val) ? val.join(", ") : String(val ?? f);
      });
      const options = (enumOf(prop) as string[] | undefined)?.map((value) => ({
        value,
        label: value.replaceAll("_", " "),
      }));
      out.push({
        instanceKey: d.instanceKey,
        fieldPath: key,
        question,
        blocking: required.has(key),
        answerType: answerType(prop),
        ...(options ? { options } : {}),
      });
    }
  }
  return out;
}

export function toGapQuestions(
  seeds: (GapSeed & { instanceKey: string })[],
  actionIdFor: (instanceKey: string) => string,
  scenarioId: (k: string) => string,
): GapQuestion[] {
  return seeds.map((s, i) => ({
    id: `${actionIdFor(s.instanceKey)}:g${i + 1}`,
    scenarioId: scenarioId(s.instanceKey),
    actionId: actionIdFor(s.instanceKey),
    fieldPath: s.fieldPath,
    question: s.question,
    required: true,
    blocking: s.blocking ?? false,
    answerType: s.answerType,
    options: s.options ?? [],
  }));
}
