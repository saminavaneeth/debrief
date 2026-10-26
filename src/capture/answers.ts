import type { ChangeSet } from "@/domain";
import { applyPatch } from "@/mcp/servers/core/patch";

/**
 * Record a gap answer and write it into the proposed record. List fields (e.g. training
 * assignees) receive the answer as one entry, so the payload keeps the schema's shape.
 * Returns a new change set; the input is not modified.
 */
export function applyGapAnswer(changeSet: ChangeSet, gapId: string, value: unknown): ChangeSet {
  const next = structuredClone(changeSet);
  const gap = next.gaps.find((g) => g.id === gapId);
  if (!gap) return next;
  gap.answer = value;
  const action = next.actions.find((a) => a.id === gap.actionId);
  if (action?.type === "create") {
    const fieldValue = gap.multiple ? [value] : value;
    action.payload = applyPatch(action.payload, [
      { op: "set", path: gap.fieldPath, value: fieldValue },
    ]).record;
    action.fieldSupport[gap.fieldPath] = { source: "user", evidenceIds: [], citations: [] };
  }
  return next;
}
