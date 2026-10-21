import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRuntime } from "@/mcp/runtime";
import { fixedClock } from "@/lib/time";
import { DEMO_NOW } from "./helpers";

// Use an in-memory runtime instead of the app's `.data/` snapshot.
beforeAll(() => {
  (globalThis as { __debriefRuntime?: unknown }).__debriefRuntime = createRuntime({
    snapshotPath: null,
    clock: fixedClock(DEMO_NOW),
  });
});

async function connectOverRoute(server: string) {
  const { POST, GET, DELETE } = await import("@/app/api/mcp/[server]/route");
  const handlers: Record<string, typeof POST> = { POST, GET, DELETE };
  const fetchViaRoute = async (url: string | URL, init?: RequestInit) => {
    const req = new Request(url, init);
    const handler = handlers[req.method];
    return handler(req, { params: Promise.resolve({ server }) } as never);
  };
  const client = new Client({ name: "route-test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost/api/mcp/${server}`), {
      fetch: fetchViaRoute,
    }),
  );
  return client;
}

describe("/api/mcp/[server] (Streamable HTTP)", () => {
  it("serves the uniform tools and resources, statelessly over the shared store", async () => {
    const client = await connectOverRoute("incidents");
    expect((await client.listTools()).tools).toHaveLength(7);
    const res = await client.callTool({ name: "get_record", arguments: { id: "INC-0007" } });
    expect((res.structuredContent as { title: string }).title).toMatch(/FL-09/);

    const write = await client.callTool({
      name: "update_record",
      arguments: {
        id: "INC-0007",
        idempotencyKey: "http-1",
        actor: "P-002",
        patch: [{ op: "append", path: "notes", value: { text: "Contractor confirmed no leak." } }],
      },
    });
    expect(write.isError).toBeFalsy();

    // A second connection sees the write: every request shares one store.
    const other = await connectOverRoute("incidents");
    const again = await other.callTool({ name: "get_record", arguments: { id: "INC-0007" } });
    expect((again.structuredContent as { notes: unknown[] }).notes).toHaveLength(1);
  });

  it("returns 404 for unknown servers", async () => {
    const { POST } = await import("@/app/api/mcp/[server]/route");
    const res = await POST(
      new Request("http://localhost/api/mcp/nope", { method: "POST", body: "{}" }),
      {
        params: Promise.resolve({ server: "nope" }),
      } as never,
    );
    expect(res.status).toBe(404);
  });
});
