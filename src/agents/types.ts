import type {
  Artifact,
  CallContext,
  Evidence,
  FieldSupport,
  KnowledgeCitation,
  ManifestRecordType,
  PatchOp,
  PerceptionFixture,
  RecordType,
  Scenario,
  ServerId,
  Shift,
  TraceStep,
} from "@/domain";
import type { OrgDirectory } from "@/lib/org";
import type { DiscoveredServer, Gateway } from "@/mcp/gateway";
import type { KnowledgeIndex } from "@/rag/knowledge-index";
import type { RecordsIndex } from "@/rag/records-index";
import type { Gazetteer } from "./nlp/gazetteer";

/* ------------------------------------------------------------------ inputs */

/** What the capture app sends for processing: scenarios, their captures, and perception. */
export interface ProcessInput {
  runId: string;
  shift: Shift;
  scenarios: Scenario[];
  artifacts: Artifact[];
  /** Inbox captures of the same shift, for sort suggestions. */
  inbox: Artifact[];
  /** Perception output per artifact: demo fixtures, or what the device extracted. */
  perception: Record<string, PerceptionFixture>;
  /** Simulated step delay in ms (0 = instant). */
  stepDelayMs?: number;
}

/* ------------------------------------------------------------------ context */

export interface EntityMention {
  evidenceId: string;
  artifactId: string;
  type: "person" | "area" | "site" | "asset" | "contractor";
  id: string;
  surface: string;
}

/** A parsed table from a document (checklist rows, sign-in rows). */
export interface DocumentTable {
  artifactId: string;
  columns: string[];
  rows: { evidenceId: string; cells: Record<string, string> }[];
}

export interface ScenarioContext {
  runId: string;
  scenario: Scenario;
  artifacts: Artifact[];
  shift: Shift;
  /** Shift date (YYYY-MM-DD) and UTC offset used for times. */
  date: string;
  utcOffset: string;
  evidence: Evidence[];
  entities: EntityMention[];
  tables: DocumentTable[];
  /** Labelled document fields (`topic`, `date`, `presenter`, …) → evidence. */
  documentFields: Map<string, Evidence>;
  servers: DiscoveredServer[];
  org: OrgDirectory;
  gazetteer: Gazetteer;
  knowledge: KnowledgeIndex;
  records: RecordsIndex;
  gateway: Gateway;
  call: CallContext;
  trace: TraceRecorder;
}

export interface TraceRecorder {
  step<T>(
    stage: TraceStep["stage"],
    label: string,
    run: () => Promise<T>,
    detail?: (result: T) => Record<string, unknown>,
    tool?: string,
  ): Promise<T>;
}

/* ------------------------------------------------------------------ route / match / draft */

export interface RouteInstance {
  key: string;
  scenarioId: string;
  server: ServerId;
  recordType: RecordType;
  manifest: ManifestRecordType;
  score: number;
  /** Routing keywords that matched, with the evidence they matched in. */
  keywordHits: { keyword: string; evidenceId: string }[];
  /** Evidence this instance is drafted from. */
  evidenceIds: string[];
  /** The evidence that routed it here (keyword hits, findings), without the wider scenario. */
  coreEvidenceIds: string[];
  /** Assets the instance is about (one instance per asset for condition records). */
  subjectAssets: string[];
  /** Hazard categories seen in the instance evidence. */
  categories: string[];
}

export interface RoutePlan {
  scenarioId: string;
  instances: RouteInstance[];
  /** Record types considered and their scores, for the trace. */
  scores: { server: ServerId; recordType: RecordType; score: number; keywords: string[] }[];
}

export interface MatchCandidate {
  id: string;
  title: string;
  score: number;
  signals: string[];
}

export interface MatchResult {
  instanceKey: string;
  decision: "create" | "update";
  target?: MatchCandidate & { record: Record<string, unknown> };
  candidates: MatchCandidate[];
}

/** Existing open record related to the scenario but not changed by it (link only). */
export interface RelatedRecord {
  scenarioId: string;
  id: string;
  server: ServerId;
  recordType: RecordType;
  title: string;
  score: number;
  reason: string;
}

export interface DraftTarget {
  instance: RouteInstance;
  match: MatchResult;
  /** Other instances of the same scenario, for context-dependent fields. */
  siblings: { instance: RouteInstance; match: MatchResult }[];
  /** Records already drafted in this scenario (creates are drafted before updates). */
  siblingDrafts?: DraftRecord[];
}

export interface GapSeed {
  fieldPath: string;
  question: string;
  answerType: "text" | "person" | "choice" | "number" | "date";
  options?: { value: string; label: string }[];
  /** Schema-required: writing the record fails without it. */
  blocking?: boolean;
}

export interface DraftRecord {
  instanceKey: string;
  scenarioId: string;
  kind: "create" | "update";
  server: ServerId;
  recordType: RecordType;
  targetId?: string;
  title: string;
  payload?: Record<string, unknown>;
  patch?: PatchOp[];
  before?: Record<string, unknown>;
  fieldSupport: Record<string, FieldSupport>;
  /** Mentions the drafter could not resolve (e.g. a name not in the roster). */
  unresolved: GapSeed[];
  /** Evidence ids cited by any field. */
  citedEvidence: Set<string>;
  citations: KnowledgeCitation[];
  confidence: number;
  rationale: string;
  subjectAssets: string[];
  /** Child item ids on the matched record (inspection items, audit findings). */
  itemIds: string[];
  manifest: ManifestRecordType;
}
