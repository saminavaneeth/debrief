import type { AuditEntry } from "@/domain";

/** Every gateway call: who, when, which tool, args hash, result, change set, latency. */
export class AuditLog {
  private entries: AuditEntry[] = [];
  private seq = 0;

  constructor(private readonly maxEntries = 5000) {}

  append(entry: Omit<AuditEntry, "id">): AuditEntry {
    const full = { id: `LOG-${String(++this.seq).padStart(6, "0")}`, ...entry };
    this.entries.push(full);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    return full;
  }

  /** Newest first. */
  list(filter: { changeSetId?: string; tool?: string; limit?: number } = {}): AuditEntry[] {
    let out = this.entries;
    if (filter.changeSetId) out = out.filter((e) => e.changeSetId === filter.changeSetId);
    if (filter.tool) out = out.filter((e) => e.tool === filter.tool);
    return out.slice(-(filter.limit ?? out.length)).reverse();
  }

  clear() {
    this.entries = [];
    this.seq = 0;
  }
}
