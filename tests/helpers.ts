import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ServerId } from "@/domain";
import { MemoryStore } from "@/mcp/store/memory-store";
import { SERVER_FACTORIES, type ServerDeps } from "@/mcp/servers";
import { OrgDirectory } from "@/lib/org";
import { loadOrganization, loadSeedRecords, loadTaxonomy } from "@/lib/seed";
import { fixedClock } from "@/lib/time";

/** Demo "now": the afternoon of the demo day. */
export const DEMO_NOW = "2026-10-21T16:30:00-05:00";

export function createTestDeps(now = DEMO_NOW) {
  const org = new OrgDirectory(loadOrganization());
  const taxonomy = loadTaxonomy();
  const store = new MemoryStore({ seed: loadSeedRecords(), snapshotPath: null });
  const clock = fixedClock(now);
  const deps: ServerDeps = {
    store,
    clock,
    refs: { org, hazardCategories: new Map(taxonomy.categories.map((c) => [c.id, c.name])) },
  };
  return { deps, store, clock, org };
}

export async function connectClient(server: ServerId, deps: ServerDeps) {
  const mcp = SERVER_FACTORIES[server](deps);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await mcp.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

/** Call a tool and return its structured result; throws with the error body when it fails. */
export async function call<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(JSON.stringify(res.structuredContent ?? res.content));
  return res.structuredContent as T;
}

export async function callRaw(client: Client, name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args });
}

export async function readJsonResource<T = Record<string, unknown>>(client: Client, uri: string) {
  const res = await client.readResource({ uri });
  const first = res.contents[0];
  if (!first || !("text" in first)) throw new Error(`No text content at ${uri}`);
  return JSON.parse(first.text as string) as T;
}
