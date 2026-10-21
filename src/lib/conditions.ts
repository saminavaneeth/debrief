import { getPath } from "@/mcp/servers/core/patch";

/** Evaluate one field condition against an object (`field` is a dot path). */
export interface Condition {
  field: string;
  op: string;
  value?: unknown;
}

export function holds(cond: Condition, target: unknown): boolean {
  const v = getPath(target, cond.field);
  switch (cond.op) {
    case "eq":
      return v === cond.value;
    case "neq":
      return v !== cond.value;
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(v);
    case "notIn":
      return Array.isArray(cond.value) && !cond.value.includes(v);
    case "exists":
      return v !== undefined && v !== null;
    case "notExists":
      return v === undefined || v === null;
    case "notEmpty":
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
    case "gt":
      return Number(v) > Number(cond.value);
    case "gte":
      return Number(v) >= Number(cond.value);
    case "lt":
      return Number(v) < Number(cond.value);
    case "lte":
      return Number(v) <= Number(cond.value);
    case "contains":
      return Array.isArray(v)
        ? v.includes(cond.value)
        : String(v ?? "").includes(String(cond.value));
    default:
      return false;
  }
}

export const allHold = (conds: Condition[], target: unknown) =>
  conds.every((c) => holds(c, target));
