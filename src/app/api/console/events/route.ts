import { connection } from "next/server";
import { getRuntime } from "@/mcp/runtime";

/** Server-Sent Events: one `change` event per store write, so the console updates live. */
export async function GET(req: Request) {
  await connection();
  const { store } = getRuntime();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", {});
      const unsubscribe = store.subscribe((change) => send("change", change));
      const keepAlive = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
      cleanup = () => {
        unsubscribe();
        clearInterval(keepAlive);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
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
