import { connection } from "next/server";
import { getRuntime } from "@/mcp/runtime";
import { isServerId } from "@/mcp/servers";

/** Records of one mock system for the EHS console: `?server=hazards`. */
export async function GET(req: Request) {
  await connection();
  const server = new URL(req.url).searchParams.get("server");
  if (server !== null && !isServerId(server)) {
    return Response.json({ error: `Unknown server "${server}"` }, { status: 404 });
  }
  const records = await getRuntime().store.list(server ? { server } : {});
  records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  return Response.json({ records });
}
