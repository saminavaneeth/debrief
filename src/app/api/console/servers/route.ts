import { connection } from "next/server";
import { getRuntime } from "@/mcp/runtime";
import { MODULES } from "@/mcp/servers";

/** The mock systems, their record types and whether the gateway has them enabled. */
export async function GET() {
  await connection();
  const { registry, store } = getRuntime();
  const records = await store.list();
  const servers = registry.list().map((entry) => {
    const { manifest } = MODULES[entry.id];
    return {
      id: entry.id,
      enabled: entry.enabled,
      transport: entry.transport.type,
      displayName: manifest.displayName,
      description: manifest.description,
      recordTypes: manifest.recordTypes.map((t) => ({
        recordType: t.recordType,
        displayName: t.displayName,
        idPrefix: t.idPrefix,
      })),
      recordCount: records.filter((r) => r.server === entry.id).length,
    };
  });
  const { org } = getRuntime().org;
  const lookup = {
    sites: Object.fromEntries(org.sites.map((s) => [s.id, s.name])),
    areas: Object.fromEntries(
      org.sites.flatMap((s) => s.areas.map((a) => [a.id, `${s.name} · ${a.name}`])),
    ),
    people: Object.fromEntries(org.people.map((p) => [p.id, p.name])),
    roles: Object.fromEntries(org.roles.map((r) => [r.id, r.name])),
    contractors: Object.fromEntries(org.contractors.map((c) => [c.id, c.name])),
  };
  return Response.json({ servers, lookup });
}
