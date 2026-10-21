import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type Picklists, type RegistryEntry, type ServerId, ServerManifest } from "@/domain";
import type { ConnectionPool } from "./connections";
import type { Registry } from "./registry";

export interface DiscoveredTool {
  /** Namespaced, e.g. `incidents.create_record`. */
  name: string;
  server: ServerId;
  tool: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
}

export interface DiscoveredServer {
  id: ServerId;
  entry: RegistryEntry;
  manifest: ServerManifest;
  tools: DiscoveredTool[];
  /** JSON Schema per record type, from `ehs://{server}/schema/{recordType}`. */
  schemas: Record<string, Record<string, unknown>>;
  picklists: Picklists;
}

async function readJson(client: Client, uri: string): Promise<unknown> {
  const res = await client.readResource({ uri });
  const first = res.contents[0];
  if (!first || !("text" in first)) throw new Error(`Resource ${uri} has no text content`);
  return JSON.parse(String(first.text));
}

/**
 * Reads tools, manifests, schemas and picklists from every enabled server. Results are cached
 * until a server is enabled or disabled.
 */
export class Discovery {
  private cache = new Map<ServerId, Promise<DiscoveredServer>>();

  constructor(
    private readonly registry: Registry,
    private readonly pool: ConnectionPool,
  ) {
    registry.onChange((id) => this.cache.delete(id));
  }

  async servers(): Promise<DiscoveredServer[]> {
    const enabled = this.registry.enabled();
    const settled = await Promise.allSettled(enabled.map((e) => this.server(e.id)));
    return settled.flatMap((s, i) => {
      if (s.status === "fulfilled") return [s.value];
      console.error(`Discovery failed for ${enabled[i].id}:`, s.reason);
      return [];
    });
  }

  server(id: ServerId): Promise<DiscoveredServer> {
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.load(id);
      pending.catch(() => this.cache.delete(id));
      this.cache.set(id, pending);
    }
    return pending;
  }

  async tools(): Promise<DiscoveredTool[]> {
    return (await this.servers()).flatMap((s) => s.tools);
  }

  invalidate(id?: ServerId) {
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }

  private async load(id: ServerId): Promise<DiscoveredServer> {
    const entry = this.registry.get(id);
    if (!entry) throw new Error(`Unknown server "${id}"`);
    const client = await this.pool.client(id);
    const [{ tools }, manifestRaw, picklists] = await Promise.all([
      client.listTools(),
      readJson(client, `ehs://${id}/manifest`),
      readJson(client, `ehs://${id}/picklists`),
    ]);
    const manifest = ServerManifest.parse(manifestRaw);
    const schemas: Record<string, Record<string, unknown>> = {};
    for (const t of manifest.recordTypes) {
      schemas[t.recordType] = (await readJson(
        client,
        `ehs://${id}/schema/${t.recordType}`,
      )) as Record<string, unknown>;
    }
    return {
      id,
      entry,
      manifest,
      schemas,
      picklists: picklists as Picklists,
      tools: tools.map((t) => ({
        name: `${id}.${t.name}`,
        server: id,
        tool: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }
}
