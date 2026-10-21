import Dexie, { type EntityTable } from "dexie";
import type { ChangeSet, Evidence, RunTrace, Scenario, Shift, Artifact } from "@/domain";
import type { PerceptionRow } from "./demo-day";

export interface BlobRow {
  artifactId: string;
  blob: Blob;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

/** Work that needs a connection (processing, pushing), queued while offline. Used from Phase 4. */
export interface QueueRow {
  seq?: number;
  kind: "process" | "push";
  payload: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "sent" | "failed";
  error?: string;
}

/** One processing run: the proposed change set (edited during review), its evidence and trace. */
export interface RunRow {
  id: string;
  createdAt: string;
  scenarioIds: string[];
  status: "in_review" | "pushed" | "partially_pushed";
  changeSet: ChangeSet;
  evidence: Evidence[];
  trace: RunTrace;
  /** Titles of cited knowledge documents. */
  knowledge: Record<string, string>;
  /** Gateway results after push. */
  results?: { actionId: string; type: string; status: string; recordId?: string; error?: string }[];
  pushedAt?: string;
}

/**
 * On-device storage for the capture app. Captures never need a connection: everything is
 * written here first. Blobs live in their own table so listing artifacts stays cheap.
 */
export class DebriefDb extends Dexie {
  shifts!: EntityTable<Shift, "id">;
  scenarios!: EntityTable<Scenario, "id">;
  artifacts!: EntityTable<Artifact, "id">;
  blobs!: EntityTable<BlobRow, "artifactId">;
  perception!: EntityTable<PerceptionRow, "artifactId">;
  settings!: EntityTable<SettingRow, "key">;
  queue!: EntityTable<QueueRow, "seq">;
  runs!: EntityTable<RunRow, "id">;

  constructor() {
    super("debrief");
    this.version(1).stores({
      shifts: "id, date",
      scenarios: "id, shiftId, updatedAt",
      artifacts: "id, shiftId, scenarioId, capturedAt",
      blobs: "artifactId",
      perception: "artifactId, fixtureId",
      settings: "key",
      queue: "++seq, kind, status, createdAt",
    });
    this.version(2).stores({ runs: "id, createdAt, status" });
  }
}

let instance: DebriefDb | undefined;

/** Lazily opened so server rendering never touches IndexedDB. */
export function getDb(): DebriefDb {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available here");
  instance ??= new DebriefDb();
  return instance;
}
