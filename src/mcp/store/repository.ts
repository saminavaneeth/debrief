import type { EhsRecord, RecordType, ServerId } from "@/domain";

export interface RecordQuery {
  server?: ServerId;
  recordType?: RecordType;
}

/** Result of a write, kept so a retried call with the same idempotency key returns it unchanged. */
export interface IdempotencyEntry {
  key: string;
  server: ServerId;
  tool: string;
  argsHash: string;
  result: unknown;
  at: string;
}

/**
 * Storage behind the mock EHS servers. Async so a database adapter can replace `MemoryStore`
 * without touching the servers. Implementations return copies; callers never mutate stored state.
 */
export interface RecordRepository {
  list(query?: RecordQuery): Promise<EhsRecord[]>;
  get(id: string): Promise<EhsRecord | undefined>;
  /** Fails if a record with the same id exists. */
  insert(record: EhsRecord): Promise<void>;
  /** Fails if the record does not exist. */
  replace(record: EhsRecord): Promise<void>;
  /** Next free id for the record type, e.g. `HAZ-0013`. */
  nextId(recordType: RecordType): Promise<string>;
  getIdempotency(server: ServerId, key: string): Promise<IdempotencyEntry | undefined>;
  putIdempotency(entry: IdempotencyEntry): Promise<void>;
  /** Restore the seed state. */
  reset(): Promise<void>;
}
