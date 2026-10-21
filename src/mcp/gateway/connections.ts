import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegistryEntry, ServerId } from "@/domain";
import type { Registry } from "./registry";

/** Builds an MCP server for the in-process transport. Supplied by the runtime wiring. */
export type InProcessFactory = (id: ServerId) => McpServer;

/** One MCP client per enabled server, created lazily over the configured transport. */
export class ConnectionPool {
  private clients = new Map<ServerId, Promise<Client>>();

  constructor(
    private readonly registry: Registry,
    private readonly inProcess: InProcessFactory,
  ) {
    registry.onChange((id, enabled) => {
      if (!enabled) void this.disconnect(id);
    });
  }

  client(id: ServerId): Promise<Client> {
    let pending = this.clients.get(id);
    if (!pending) {
      const entry = this.registry.get(id);
      if (!entry) return Promise.reject(new Error(`Unknown server "${id}"`));
      pending = this.connect(entry);
      pending.catch(() => this.clients.delete(id));
      this.clients.set(id, pending);
    }
    return pending;
  }

  async disconnect(id: ServerId): Promise<void> {
    const pending = this.clients.get(id);
    this.clients.delete(id);
    if (pending) await (await pending.catch(() => null))?.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.clients.keys()].map((id) => this.disconnect(id)));
  }

  private async connect(entry: RegistryEntry): Promise<Client> {
    const client = new Client({ name: "debrief-gateway", version: "1.0.0" });
    switch (entry.transport.type) {
      case "in-process": {
        const server = this.inProcess(entry.id);
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        await server.connect(serverSide);
        await client.connect(clientSide);
        break;
      }
      case "http":
        await client.connect(new StreamableHTTPClientTransport(new URL(entry.transport.url)));
        break;
      case "stdio":
        await client.connect(
          new StdioClientTransport({
            command: entry.transport.command,
            args: entry.transport.args,
          }),
        );
        break;
    }
    return client;
  }
}
