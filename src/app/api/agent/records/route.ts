import { connection } from "next/server";
import type { EhsRecord } from "@/domain";
import { getRuntime } from "@/mcp/runtime";
import { AGENT_CALL } from "@/server/agent-runtime";

/**
 * Records for the Results screen: the requested ids plus the records they link to, read
 * through the gateway. `?ids=INC-0009,HAZ-0007`.
 */
export async function GET(req: Request) {
  await connection();
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  const { gateway } = getRuntime();
  const records = new Map<string, EhsRecord>();
  const load = async (id: string) => {
    if (records.has(id)) return;
    try {
      records.set(id, await gateway.getRecord(id, AGENT_CALL));
    } catch {
      // Unknown or disconnected: leave it out.
    }
  };
  await Promise.all(ids.map(load));
  const linked = [...records.values()].flatMap((r) => r.links.map((l) => l.targetId));
  await Promise.all(linked.map(load));
  return Response.json({ records: [...records.values()] });
}
