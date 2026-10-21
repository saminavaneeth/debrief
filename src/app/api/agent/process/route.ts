import { z } from "zod";
import { runPipeline } from "@/agents/orchestrator/pipeline";
import { Artifact, PerceptionFixture, Scenario, Shift } from "@/domain";
import { getAgentRuntime } from "@/server/agent-runtime";

const ProcessRequest = z.object({
  runId: z
    .string()
    .regex(/^[A-Za-z0-9-]+$/)
    .optional(),
  shift: Shift,
  scenarios: z.array(Scenario).min(1),
  artifacts: z.array(Artifact),
  inbox: z.array(Artifact).default([]),
  perception: z.record(z.string(), PerceptionFixture).default({}),
  stepDelayMs: z.number().int().min(0).max(2000).default(0),
});

/**
 * Process scenarios. Streams the run trace as Server-Sent Events (`step`), then the change set,
 * evidence and trace (`result`), or `error`.
 */
export async function POST(req: Request) {
  const parsed = ProcessRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const input = {
    ...parsed.data,
    runId: parsed.data.runId ?? `RUN-${Date.now().toString(36).toUpperCase()}`,
  };
  const { provider, deps } = getAgentRuntime();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const result = await runPipeline(provider, deps, input, (step) => send("step", step));
        send("result", result);
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
