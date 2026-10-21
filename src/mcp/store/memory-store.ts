import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EhsRecord, RECORD_TYPE_PREFIX, type RecordType } from "@/domain";
import type { IdempotencyEntry, RecordQuery, RecordRepository } from "./repository";

const Snapshot = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  records: z.array(EhsRecord),
  idempotency: z.array(
    z.object({
      key: z.string(),
      server: z.string(),
      tool: z.string(),
      argsHash: z.string(),
      result: z.unknown(),
      at: z.string(),
    }),
  ),
});

export interface MemoryStoreOptions {
  /** Records restored by `reset()` and used when no snapshot exists. */
  seed: EhsRecord[];
  /** JSON file to load on start and rewrite after every write; `null` keeps state in memory only. */
  snapshotPath?: string | null;
  /** Load the snapshot but never write it (e.g. a stdio server next to the running app). */
  readOnlySnapshot?: boolean;
}

const idemKey = (server: string, key: string) => `${server}\u0000${key}`;

/** Emitted after every write; `ids` is empty for a reset. */
export interface StoreChange {
  kind: "insert" | "replace" | "reset";
  ids: string[];
}

export class MemoryStore implements RecordRepository {
  private records = new Map<string, EhsRecord>();
  private listeners = new Set<(change: StoreChange) => void>();
  private idempotency = new Map<string, IdempotencyEntry>();
  private readonly seed: EhsRecord[];
  private readonly snapshotPath: string | null;
  private readonly readOnlySnapshot: boolean;

  constructor(options: MemoryStoreOptions) {
    this.seed = structuredClone(options.seed);
    this.snapshotPath = options.snapshotPath ?? null;
    this.readOnlySnapshot = options.readOnlySnapshot ?? false;
    if (!this.loadSnapshot()) this.loadSeed();
  }

  async list(query: RecordQuery = {}): Promise<EhsRecord[]> {
    const out: EhsRecord[] = [];
    for (const r of this.records.values()) {
      if (query.server && r.server !== query.server) continue;
      if (query.recordType && r.recordType !== query.recordType) continue;
      out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<EhsRecord | undefined> {
    const r = this.records.get(id);
    return r ? structuredClone(r) : undefined;
  }

  async insert(record: EhsRecord): Promise<void> {
    if (this.records.has(record.id)) throw new Error(`Record ${record.id} already exists`);
    this.records.set(record.id, structuredClone(record));
    this.save();
    this.notify({ kind: "insert", ids: [record.id] });
  }

  async replace(record: EhsRecord): Promise<void> {
    if (!this.records.has(record.id)) throw new Error(`Record ${record.id} not found`);
    this.records.set(record.id, structuredClone(record));
    this.save();
    this.notify({ kind: "replace", ids: [record.id] });
  }

  async nextId(recordType: RecordType): Promise<string> {
    const prefix = RECORD_TYPE_PREFIX[recordType];
    let max = 0;
    for (const id of this.records.keys()) {
      if (id.startsWith(`${prefix}-`)) max = Math.max(max, Number(id.slice(prefix.length + 1)));
    }
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
  }

  async getIdempotency(server: string, key: string) {
    const entry = this.idempotency.get(idemKey(server, key));
    return entry ? structuredClone(entry) : undefined;
  }

  async putIdempotency(entry: IdempotencyEntry): Promise<void> {
    this.idempotency.set(idemKey(entry.server, entry.key), structuredClone(entry));
    this.save();
  }

  async reset(): Promise<void> {
    this.loadSeed();
    this.save();
    this.notify({ kind: "reset", ids: [] });
  }

  /** Change feed for the console. Returns an unsubscribe function. */
  subscribe(fn: (change: StoreChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(change: StoreChange) {
    for (const fn of this.listeners) fn(change);
  }

  private loadSeed() {
    this.records = new Map(this.seed.map((r) => [r.id, structuredClone(r)]));
    this.idempotency = new Map();
  }

  private loadSnapshot(): boolean {
    if (!this.snapshotPath || !fs.existsSync(this.snapshotPath)) return false;
    const parsed = Snapshot.safeParse(JSON.parse(fs.readFileSync(this.snapshotPath, "utf8")));
    if (!parsed.success) {
      console.warn(`Ignoring invalid snapshot ${this.snapshotPath}; starting from seed.`);
      return false;
    }
    this.records = new Map(parsed.data.records.map((r) => [r.id, r]));
    this.idempotency = new Map(
      parsed.data.idempotency.map((e) => [idemKey(e.server, e.key), e as IdempotencyEntry]),
    );
    return true;
  }

  private save() {
    if (!this.snapshotPath || this.readOnlySnapshot) return;
    fs.mkdirSync(path.dirname(this.snapshotPath), { recursive: true });
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      records: [...this.records.values()],
      idempotency: [...this.idempotency.values()],
    };
    const tmp = `${this.snapshotPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, this.snapshotPath);
  }
}
