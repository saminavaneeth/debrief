import MiniSearch from "minisearch";
import type { CallContext, RecordType, ServerId } from "@/domain";
import type { Gateway } from "@/mcp/gateway";
import { hybridScore } from "./embedder";

export interface IndexedRecord {
  id: string;
  server: ServerId;
  recordType: RecordType;
  title: string;
  summary: string;
  status: string;
  siteId: string;
  areaId?: string;
  assetIds: string[];
  category?: string;
  eventAt: string;
  updatedAt: string;
}

export interface RecordHit {
  record: IndexedRecord;
  score: number;
}

/**
 * Every record across the enabled servers, read through the gateway (the agent never touches a
 * server's store). Rebuilt lazily after any `record.*` event. Powers related-record search and
 * duplicate checks; per-server candidate search uses each server's `search_records`.
 */
export class RecordsIndex {
  private records: IndexedRecord[] = [];
  private index: MiniSearch<IndexedRecord> | null = null;
  private dirty = true;

  constructor(
    private readonly gateway: Gateway,
    private readonly ctx: CallContext,
  ) {
    gateway.events.on(() => {
      this.dirty = true;
    });
    gateway.registry.onChange(() => {
      this.dirty = true;
    });
  }

  async refresh(): Promise<void> {
    const all: IndexedRecord[] = [];
    for (const s of await this.gateway.discovery.servers()) {
      for (let offset = 0; ; offset += 100) {
        const page = await this.gateway.search(s.id, { limit: 100, offset }, this.ctx);
        all.push(
          ...(page.results as unknown as Omit<IndexedRecord, "server">[]).map((r) => ({
            ...r,
            server: s.id,
          })),
        );
        if (offset + 100 >= page.total) break;
      }
    }
    this.records = all;
    this.index = new MiniSearch<IndexedRecord>({
      fields: ["title", "summary", "assetText", "category"],
      storeFields: ["id"],
      extractField: (doc, field) =>
        field === "assetText"
          ? doc.assetIds.join(" ")
          : String((doc as unknown as Record<string, unknown>)[field] ?? ""),
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2, assetText: 3 } },
    });
    this.index.addAll(all);
    this.dirty = false;
  }

  async all(): Promise<IndexedRecord[]> {
    if (this.dirty) await this.refresh();
    return this.records;
  }

  async search(
    query: string,
    filter: {
      recordTypes?: RecordType[];
      statuses?: string[];
      areaId?: string;
      categories?: string[];
      excludeIds?: string[];
    } = {},
  ): Promise<RecordHit[]> {
    if (this.dirty || !this.index) await this.refresh();
    const ok = (r: IndexedRecord) =>
      (!filter.recordTypes || filter.recordTypes.includes(r.recordType)) &&
      (!filter.statuses || filter.statuses.includes(r.status)) &&
      (!filter.areaId || r.areaId === filter.areaId) &&
      (!filter.categories ||
        (r.category !== undefined && filter.categories.includes(r.category))) &&
      !filter.excludeIds?.includes(r.id);
    const byId = new Map(this.records.map((r) => [r.id, r]));
    if (!query.trim()) return this.records.filter(ok).map((record) => ({ record, score: 0 }));
    const raw = this.index!.search(query, { combineWith: "OR" }).filter((h) =>
      ok(byId.get(String(h.id))!),
    );
    const max = raw[0]?.score ?? 0;
    return raw.map((h) => ({ record: byId.get(String(h.id))!, score: hybridScore(h.score, max) }));
  }
}
