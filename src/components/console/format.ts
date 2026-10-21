import type { Lookup } from "./types";

export function humanize(key: string): string {
  const spaced = key
    .replace(/Id$/, "")
    .replace(/Ids$/, "s")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function formatDateTime(iso: string): string {
  // Stored timestamps carry the site offset; show them as written (site local time).
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const date = `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
  return m[4] ? `${date}, ${m[4]}:${m[5]}` : date;
}

const PERSON_KEYS = new Set([
  "reportedBy",
  "equipmentOperatorId",
  "personId",
  "facilitatorId",
  "inspectorId",
  "leadAuditorId",
  "spokeWithId",
  "createdBy",
  "by",
  "attachedBy",
]);

/** Display text for a field value, resolving ids to names where possible. */
export function formatValue(key: string, value: unknown, lookup: Lookup | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => formatValue(key.replace(/s$/, ""), v, lookup)).join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humanize(k)}: ${formatValue(k, v, lookup)}`)
      .join(" · ");
  }
  const s = String(value);
  if (lookup) {
    if (key === "areaId") return lookup.areas[s] ?? s;
    if (key === "siteId") return lookup.sites[s] ?? s;
    if (key === "contractorId") return lookup.contractors[s] ?? s;
    if (PERSON_KEYS.has(key) || key === "assigneeId" || key === "ownerRef") {
      if (s.startsWith("role:")) return `${lookup.roles[s.slice(5)] ?? s.slice(5)} (role)`;
      if (s.startsWith("workflow:")) return `Workflow ${s.slice(9)}`;
      if (s === "agent") return "Debrief agent";
      return lookup.people[s] ?? s;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return formatDateTime(s);
  return s.replaceAll("_", " ");
}

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 text-amber-900 border-amber-300",
  reported: "bg-amber-100 text-amber-900 border-amber-300",
  scheduled: "bg-sky-100 text-sky-900 border-sky-300",
  planned: "bg-sky-100 text-sky-900 border-sky-300",
  in_progress: "bg-indigo-100 text-indigo-900 border-indigo-300",
  investigating: "bg-indigo-100 text-indigo-900 border-indigo-300",
  mitigating: "bg-indigo-100 text-indigo-900 border-indigo-300",
  actions_open: "bg-indigo-100 text-indigo-900 border-indigo-300",
  assigned: "bg-indigo-100 text-indigo-900 border-indigo-300",
  overdue: "bg-red-100 text-red-900 border-red-300",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  closed: "bg-zinc-100 text-zinc-700 border-zinc-300",
  done: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

export const statusTone = (status: string) =>
  STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-800 border-zinc-300";
