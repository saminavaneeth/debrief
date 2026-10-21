import { areaLabel, contractorName, ownerName, siteName, tagName } from "@/capture/reference";

const LABELS: Record<string, string> = {
  areaId: "Area",
  siteId: "Site",
  assetIds: "Equipment",
  reportedBy: "Reported by",
  occurredAt: "When",
  observedAt: "When",
  identifiedAt: "Identified",
  heldAt: "Held",
  incidentType: "Type",
  observationType: "Type",
  meetingType: "Type",
  involvedPeople: "People involved",
  equipmentOperatorId: "Equipment operator",
  immediateActions: "Immediate actions",
  recordable: "OSHA recordable",
  recordabilityBasis: "Recordability basis",
  riskLevel: "Risk",
  correctiveActions: "Corrective actions",
  contractorId: "Contractor",
  stopWorkInvoked: "Stop work",
  spokeWithId: "Spoke with",
  facilitatorId: "Facilitator",
  durationMinutes: "Duration",
  actionItems: "Action items",
  requirementRef: "Requirement",
  completedAt: "Completed",
};

export function fieldLabel(path: string): string {
  const leaf =
    path
      .replace(/\[[^\]]*\]/g, "")
      .split(".")
      .pop() ?? path;
  const item = /\[([^\]+][^\]]*)\]/.exec(path)?.[1];
  const base =
    LABELS[leaf] ??
    leaf.charAt(0).toUpperCase() +
      leaf
        .slice(1)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase();
  return item ? `${item} · ${base}` : base;
}

const PERSON_KEY =
  /(^|\.)(reportedBy|equipmentOperatorId|facilitatorId|spokeWithId|personId|inspectorId|leadAuditorId|ownerRef)$/;

function formatDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  if (!m) return v;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return m[4] ? `${day}, ${m[4]}:${m[5]}` : day;
}

/** Display text for a scalar value at a field path. */
export function formatScalar(path: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const leaf =
    path
      .replace(/\[[^\]]*\]/g, "")
      .split(".")
      .pop() ?? path;
  if (typeof v === "number")
    return leaf === "durationMinutes" ? `${v} min` : leaf === "severity" ? `${v} of 5` : String(v);
  const s = String(v);
  if (leaf === "areaId") return areaLabel(s) ?? s;
  if (leaf === "siteId") return siteName(s) ?? s;
  if (leaf === "contractorId") return contractorName(s);
  if (leaf === "category") return tagName(s);
  if (PERSON_KEY.test(path) || PERSON_KEY.test(`.${leaf}`)) return ownerName(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatDate(s);
  return /^[a-z]+(_[a-z]+)+$|^[a-z]+$/.test(s) ? s.replaceAll("_", " ") : s;
}

/** One line per list item, for arrays of objects (attendees, actions, people). */
export function formatItem(path: string, item: unknown): string {
  if (typeof item !== "object" || item === null) return formatScalar(path, item);
  const o = item as Record<string, unknown>;
  if ("role" in o)
    return `${o.personId ? ownerName(String(o.personId)) : String(o.name)} · ${String(o.role).replaceAll("_", " ")}`;
  if ("title" in o) {
    const owner = o.ownerRef ? ` · ${ownerName(String(o.ownerRef))}` : "";
    const due = o.dueDate ? ` · due ${formatDate(String(o.dueDate))}` : "";
    return `${String(o.title)}${owner}${due}`;
  }
  if ("name" in o)
    return o.personId
      ? `${ownerName(String(o.personId))}${o.name !== ownerName(String(o.personId)) ? ` (“${String(o.name)}”)` : ""}`
      : `${String(o.name)} — not in roster`;
  if ("text" in o) return String(o.text);
  return Object.entries(o)
    .map(([k, v]) => `${fieldLabel(k)}: ${formatScalar(k, v)}`)
    .join(" · ");
}
