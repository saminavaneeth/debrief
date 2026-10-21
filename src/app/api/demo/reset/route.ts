import { resetDemo } from "@/mcp/runtime";

/** "Reset demo": restore seed records and clear the audit log. */
export async function POST() {
  await resetDemo();
  return Response.json({ ok: true });
}
