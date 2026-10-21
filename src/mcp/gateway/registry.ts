import type { McpConfig, RegistryEntry, ServerId } from "@/domain";

/** Connected servers from `mcp.config.json`, with runtime enable/disable. */
export class Registry {
  private entries: Map<ServerId, RegistryEntry>;
  private listeners = new Set<(id: ServerId, enabled: boolean) => void>();

  constructor(config: McpConfig) {
    this.entries = new Map(config.servers.map((s) => [s.id, structuredClone(s)]));
  }

  list(): RegistryEntry[] {
    return [...this.entries.values()].map((e) => structuredClone(e));
  }

  get(id: ServerId): RegistryEntry | undefined {
    const e = this.entries.get(id);
    return e ? structuredClone(e) : undefined;
  }

  enabled(): RegistryEntry[] {
    return this.list().filter((e) => e.enabled);
  }

  isEnabled(id: ServerId): boolean {
    return this.entries.get(id)?.enabled ?? false;
  }

  setEnabled(id: ServerId, enabled: boolean): void {
    const e = this.entries.get(id);
    if (!e) throw new Error(`Unknown server "${id}"`);
    if (e.enabled === enabled) return;
    e.enabled = enabled;
    for (const fn of this.listeners) fn(id, enabled);
  }

  onChange(fn: (id: ServerId, enabled: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
