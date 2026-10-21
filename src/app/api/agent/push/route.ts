import { z } from "zod";
import { ChangeSet } from "@/domain";
import { getRuntime } from "@/mcp/runtime";
import { AGENT_CALL } from "@/server/agent-runtime";

const PushRequest = z.object({
  changeSet: ChangeSet,
  /** Media details for attach actions, by artifact id. */
  artifacts: z.record(
    z.string(),
    z.object({
      modality: z.enum(["voice", "photo", "video", "document", "note"]),
      uri: z.string().optional(),
      caption: z.string().optional(),
    }),
  ),
});

/** Execute the approved actions of a change set through the gateway. */
export async function POST(req: Request) {
  const parsed = PushRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const report = await getRuntime().gateway.executeChangeSet(parsed.data.changeSet, AGENT_CALL, {
    artifacts: parsed.data.artifacts,
  });
  return Response.json(report);
}
