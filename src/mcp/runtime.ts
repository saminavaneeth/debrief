import type { ServerId } from "@/domain";
import { dataPath } from "@/lib/data-files";
import { OrgDirectory } from "@/lib/org";
import {
  loadMcpConfig,
  loadOrganization,
  loadPolicy,
  loadSeedRecords,
  loadTaxonomy,
  loadWorkflowRules,
} from "@/lib/seed";
import { type Clock, systemClock } from "@/lib/time";
import { WorkflowEngine } from "@/workflows/engine";
import { WorkflowFeed } from "@/workflows/feed";
import type { RuleProposal } from "@/workflows/proposals";
import {
  AuditLog,
  ConnectionPool,
  Discovery,
  EventBus,
  Gateway,
  Policy,
  Registry,
} from "./gateway";
import { SERVER_FACTORIES, type ServerDeps } from "./servers";
import { MemoryStore } from "./store/memory-store";

/**
 * Process-wide wiring: one store, one set of servers and one gateway. Kept on `globalThis` so
 * Next.js dev reloads and every route handler share the same state.
 */
export interface Runtime {
  store: MemoryStore;
  org: OrgDirectory;
  serverDeps: ServerDeps;
  registry: Registry;
  pool: ConnectionPool;
  gateway: Gateway;
  events: EventBus;
  audit: AuditLog;
  clock: Clock;
  policy: Policy;
  workflows: WorkflowEngine;
  feed: WorkflowFeed;
  /** Rules the agent proposed from patterns, waiting for an admin. */
  proposals: RuleProposal[];
}

/** `DEBRIEF_SNAPSHOT` overrides the snapshot file (end-to-end tests use their own). */
export const SNAPSHOT_PATH = process.env.DEBRIEF_SNAPSHOT || dataPath(".data", "store.json");

export interface RuntimeOptions {
  snapshotPath?: string | null;
  readOnlySnapshot?: boolean;
  clock?: Clock;
}

export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const org = new OrgDirectory(loadOrganization());
  const taxonomy = loadTaxonomy();
  const clock = options.clock ?? systemClock;
  const store = new MemoryStore({
    seed: loadSeedRecords(),
    snapshotPath: options.snapshotPath === undefined ? SNAPSHOT_PATH : options.snapshotPath,
    readOnlySnapshot: options.readOnlySnapshot,
  });
  const serverDeps: ServerDeps = {
    store,
    clock,
    refs: { org, hazardCategories: new Map(taxonomy.categories.map((c) => [c.id, c.name])) },
  };
  const registry = new Registry(loadMcpConfig());
  const pool = new ConnectionPool(registry, (id: ServerId) => SERVER_FACTORIES[id](serverDeps));
  const discovery = new Discovery(registry, pool);
  const events = new EventBus();
  const audit = new AuditLog();
  const policy = new Policy(loadPolicy());
  const gateway = new Gateway({
    registry,
    pool,
    discovery,
    policy,
    audit,
    events,
    clock,
    utcOffset: org.utcOffset,
  });
  const feed = new WorkflowFeed();
  const workflows = new WorkflowEngine({ gateway, org, clock, feed }, loadWorkflowRules());
  workflows.attach(events);
  return {
    store,
    org,
    serverDeps,
    registry,
    pool,
    gateway,
    events,
    audit,
    clock,
    policy,
    workflows,
    feed,
    proposals: [],
  };
}

const globalForRuntime = globalThis as unknown as { __debriefRuntime?: Runtime };

export function getRuntime(): Runtime {
  globalForRuntime.__debriefRuntime ??= createRuntime();
  return globalForRuntime.__debriefRuntime;
}

/**
 * "Reset demo": seed records back; audit log, events, workflow feed and proposals cleared;
 * servers, policy and rules back to their configuration.
 */
export async function resetDemo(runtime = getRuntime()): Promise<void> {
  await runtime.store.reset();
  runtime.audit.clear();
  runtime.events.clearHistory();
  runtime.feed.clear();
  runtime.workflows.reset();
  runtime.registry.reset();
  runtime.policy.reset();
  runtime.proposals.splice(0);
}
