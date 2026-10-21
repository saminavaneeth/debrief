import { connection } from "next/server";
import { getRuntime } from "@/mcp/runtime";

/** Health check for hosting platforms: the runtime (store, gateway, servers) is up. */
export async function GET() {
  await connection();
  const runtime = getRuntime();
  return Response.json({
    ok: true,
    servers: runtime.registry.enabled().map((s) => s.id),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
