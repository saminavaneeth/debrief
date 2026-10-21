import { z } from "zod";
import {
  ActionItem,
  AuditFinding,
  CorrectiveAction,
  EhsRecord,
  InspectionItem,
  Note,
  RECORD_SCHEMAS,
  type RecordType,
} from "@/domain";
import type { OrgDirectory } from "@/lib/org";

export interface FieldError {
  path: string;
  message: string;
}

/** Fields the server assigns; they are not part of a create payload. */
export const SERVER_MANAGED_FIELDS = [
  "id",
  "server",
  "recordType",
  "createdAt",
  "updatedAt",
  "createdBy",
  "history",
  "links",
  "evidence",
] as const;

function issuePath(path: PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join("");
}

/* Child items as a caller sends them: fields the server fills (ids, timestamps, default status)
 * are optional, and corrective actions may give `dueInDays` instead of `dueDate`. */

export const CorrectiveActionInput = CorrectiveAction.partial({
  id: true,
  status: true,
  createdAt: true,
  createdBy: true,
  dueDate: true,
}).extend({
  dueInDays: z.number().int().nonnegative().optional().describe("Due date relative to today."),
});
const correctiveActionsInput = z.array(CorrectiveActionInput).default([]);

const CHILD_INPUTS: Record<string, z.ZodType> = {
  correctiveActions: correctiveActionsInput,
  notes: z.array(Note.partial({ at: true, by: true })).default([]),
  findings: z
    .array(
      AuditFinding.partial({ id: true, observedAt: true, status: true }).extend({
        correctiveActions: correctiveActionsInput,
      }),
    )
    .default([]),
  actionItems: z.array(ActionItem.partial({ id: true, status: true })).default([]),
  items: z.array(InspectionItem.extend({ correctiveActions: correctiveActionsInput })),
};

/**
 * Schema the drafter fills for a create: the record schema without server-managed fields, with
 * `status` defaulting to the module's initial status and child items in their input form.
 * Published as JSON Schema at `ehs://{server}/schema/{recordType}`.
 */
export function createPayloadSchema(recordType: RecordType, initialStatus: string) {
  const schema = RECORD_SCHEMAS[recordType] as unknown as z.ZodObject<z.ZodRawShape>;
  const mask = Object.fromEntries(SERVER_MANAGED_FIELDS.map((k) => [k, true])) as Record<
    string,
    true
  >;
  const status = schema.shape.status as z.ZodEnum;
  const overrides: Record<string, z.ZodType> = { status: status.default(initialStatus as never) };
  for (const [key, input] of Object.entries(CHILD_INPUTS)) {
    if (key in schema.shape) overrides[key] = input;
  }
  return schema.omit(mask).extend(overrides);
}

export interface ReferenceData {
  org: OrgDirectory;
  /** Hazard taxonomy category id → display name. */
  hazardCategories: Map<string, string>;
}

const PERSON_KEYS = new Set([
  "reportedBy",
  "equipmentOperatorId",
  "personId",
  "facilitatorId",
  "inspectorId",
  "leadAuditorId",
  "spokeWithId",
]);

/** Checks ids that point at organization data (sites, areas, assets, people, roles, categories). */
export function checkReferences(
  record: Record<string, unknown>,
  refs: ReferenceData,
): FieldError[] {
  const { org } = refs;
  const errors: FieldError[] = [];
  const siteId = record.siteId as string | undefined;

  if (siteId && !org.sites.has(siteId))
    errors.push({ path: "siteId", message: `Unknown site ${siteId}` });

  const visit = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${path}[${i}]`));
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      const p = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        if (key === "areaId") {
          const area = org.areas.get(value);
          if (!area) errors.push({ path: p, message: `Unknown area ${value}` });
          else if (siteId && area.siteId !== siteId) {
            errors.push({ path: p, message: `Area ${value} is not in site ${siteId}` });
          }
        } else if (key === "assetId" && !org.assets.has(value)) {
          errors.push({ path: p, message: `Unknown asset ${value}` });
        } else if (PERSON_KEYS.has(key) && !org.people.has(value)) {
          errors.push({ path: p, message: `Unknown person ${value}` });
        } else if (key === "ownerRef") {
          const ok = value.startsWith("role:")
            ? org.roles.has(value.slice(5))
            : org.people.has(value);
          if (!ok) errors.push({ path: p, message: `Unknown owner ${value}` });
        } else if (key === "contractorId" && !org.contractors.has(value)) {
          errors.push({ path: p, message: `Unknown contractor ${value}` });
        } else if (
          key === "category" &&
          path === "" &&
          (record.recordType === "hazard" || record.recordType === "observation") &&
          !refs.hazardCategories.has(value)
        ) {
          errors.push({ path: p, message: `Unknown hazard category ${value}` });
        }
      } else if (Array.isArray(value) && (key === "assetIds" || key === "assigneeIds")) {
        value.forEach((v, i) => {
          const known = key === "assetIds" ? org.assets.has(v) : org.people.has(v);
          if (!known)
            errors.push({
              path: `${p}[${i}]`,
              message: `Unknown ${key === "assetIds" ? "asset" : "person"} ${v}`,
            });
        });
      } else {
        visit(value, p);
      }
    }
  };
  visit(record, "");
  return errors;
}

/** Full validation of a stored record: schema first, then references. */
export function validateRecord(
  record: unknown,
  refs: ReferenceData,
): { ok: true; record: EhsRecord } | { ok: false; errors: FieldError[] } {
  const parsed = EhsRecord.safeParse(record);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ path: issuePath(i.path), message: i.message })),
    };
  }
  const refErrors = checkReferences(parsed.data as unknown as Record<string, unknown>, refs);
  if (refErrors.length) return { ok: false, errors: refErrors };
  return { ok: true, record: parsed.data };
}
