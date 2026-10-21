# Debrief — Architecture

## 1. Overview

```mermaid
flowchart TB
  subgraph Client["Field capture app (PWA)"]
    UI["Today · Capture · Scenario · Review · Records · Platform"]
    DB[("IndexedDB (Dexie)\nshifts · scenarios · artifacts · offline queue")]
  end

  subgraph Server["Next.js server"]
    ING["Ingestion\nvoice · photo · video · document · note → Evidence"]
    ORC["Orchestrator\nrouter → matcher → drafter → gap-finder → planner"]
    RAG[("RAG indexes\nrecords · knowledge")]
    GW["MCP gateway\nregistry · discovery · policy · executor · audit log · event bus"]
    WF["Workflow engine\nJSON rules"]
  end

  subgraph Systems["EHS systems (MCP servers)"]
    INC[incidents]
    AUD[audits]
    MTG[meetings]
    HAZ[hazards]
    INS[inspections]
    TRN["training (disabled at start)"]
  end

  UI <--> DB
  UI -- "process (SSE run trace)" --> ING --> ORC
  ORC <--> RAG
  ORC -- "read manifests, schemas, search" --> GW
  UI -- "approve change set" --> GW
  GW --> INC & AUD & MTG & HAZ & INS & TRN
  GW -- "record.* events" --> WF
  WF -- "rule actions" --> GW
  GW -- "record.* events" --> RAG
```

All AI capabilities sit behind one `AgentProvider` interface (`src/agents/provider.ts`). The demo
provider uses fixture perception and real rule-based reasoning; a live model provider implements the
same interface.

## 2. Components

| Component                      | Location                                                 | Responsibility                                                                       |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Capture app                    | `src/app/(app)`, `src/capture`                           | Capture artifacts offline, group into scenarios, review and approve change sets      |
| Domain                         | `src/domain`                                             | Types and Zod schemas shared by every layer                                          |
| Ingestion                      | `src/agents/*` (perception methods)                      | Turn each artifact into `Evidence[]`                                                 |
| Orchestrator                   | `src/agents/orchestrator`                                | Route, match, draft, find gaps, plan a `ChangeSet`                                   |
| RAG                            | `src/rag`                                                | Hybrid search over records and knowledge                                             |
| Gateway                        | `src/mcp/gateway`                                        | The only path for writes: policy, validation, idempotency, audit, events             |
| Mock EHS servers               | `src/mcp/servers`                                        | One MCP server per module over a shared store                                        |
| Store                          | `src/mcp/store`                                          | Repository interface; `MemoryStore` seeded from `data/seed`, snapshotted to `.data/` |
| Workflow engine                | `src/workflows`                                          | Evaluate JSON rules on record events; act through the gateway                        |
| Console / Platform / Presenter | `src/app/console`, `src/app/platform`, `src/app/present` | Inspect the mock systems and the platform                                            |

**Boundary rule:** `src/agents/*` never imports from `src/mcp/servers/*`. The agent layer knows a
module only through what the gateway discovers at runtime.

## 3. Data model

```mermaid
erDiagram
  SHIFT ||--o{ SCENARIO : contains
  SHIFT ||--o{ ARTIFACT : contains
  SCENARIO |o--o{ ARTIFACT : groups
  ARTIFACT ||--o{ EVIDENCE : yields
  SCENARIO ||--o{ CHANGE_SET : "processed into"
  CHANGE_SET ||--o{ ACTION : proposes
  CHANGE_SET ||--o{ GAP_QUESTION : asks
  ACTION }o--o{ EVIDENCE : "cites (per field)"
  ACTION |o--o| RECORD : "creates / updates"
  RECORD ||--o{ LINK : has
  RECORD ||--o{ CORRECTIVE_ACTION : has
  RECORD ||--o{ ATTACHED_EVIDENCE : has
  RECORD ||--o{ HISTORY_ENTRY : has
```

### Capture side (client, IndexedDB)

- **Shift** — one user's work day (`date`, `siteId`, `startedAt`).
- **Scenario** — one situation; `status`: capturing → ready → processing → in_review → pushed.
- **Artifact** — one capture: `modality`, `capturedAt`, `capturedBy`, site/area, optional
  `assetTag`, `media` (blob key or demo asset path), optional `text` (note or edited transcript),
  quick-tag `tags`. `scenarioId: null` means it is in the Inbox.

### Evidence

An atomic fact from one artifact, with **provenance**:

| Provenance         | Points at                                                 |
| ------------------ | --------------------------------------------------------- |
| `transcript_span`  | Character range (and optional time range) in a transcript |
| `text_span`        | Character range in a note                                 |
| `image_region`     | Normalized bounding box; `frameMs` for video keyframes    |
| `document_field`   | Page, field name and excerpt                              |
| `capture_metadata` | Capture time, user, location, asset tag or tags           |

### Records (server side)

Every record shares an envelope (`src/domain/records/base.ts`): `id`, `server`, `recordType`,
`title`, `description`, `status`, `siteId`, `areaId`, `assetIds`, `createdAt/updatedAt/createdBy`,
`notes[]`, `correctiveActions[]`, `links[]`, `evidence[]`, `history[]`. Type-specific fields are
flat on the record so patch paths stay short (`severity`, `riskLevel`, `items[FE-115].response`).

| Record type         | Server      | ID     | Key fields                                                                                                            |
| ------------------- | ----------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| incident            | incidents   | `INC-` | incidentType, severity, occurredAt, involvedPeople, equipmentOperatorId, injury, recordable(+basis), immediateActions |
| hazard              | hazards     | `HAZ-` | category (taxonomy), riskLevel, identifiedAt, source                                                                  |
| observation         | hazards     | `OBS-` | observationType, category, severity, contractorId, stopWorkInvoked, spokeWithId                                       |
| audit               | audits      | `AUD-` | auditType, contractorId, scope, leadAuditorId, findings[] (each with correctiveActions[])                             |
| safety_meeting      | meetings    | `MTG-` | meetingType, topic, heldAt, durationMinutes, facilitatorId, attendees[], actionItems[]                                |
| inspection          | inspections | `INS-` | templateId, scheduledDate, completedAt, inspectorId, result, items[] (each with correctiveActions[])                  |
| training_assignment | training    | `TRN-` | course, assigneeIds, dueDate, reason                                                                                  |

Child items (inspection items, audit findings) are addressed by their `id`; for asset-based
inspections the item id is the asset tag. Links are stored on both records; a link from a child item
carries `itemId`.

### Change set

A `ChangeSet` holds ordered `ProposedAction`s — `create`, `update`, `link`, `attach` — each with
`confidence`, `rationale`, `autonomy` (`auto` / `approve` / `blocked`), `dependsOn`, and for creates
and updates a `fieldSupport` map: field path → `{ source, evidenceIds, citations, rule }`. Actions
that create records are referenced by later actions as `{ actionId }` until the gateway returns real
IDs. `GapQuestion`s target a field on an action; `SortSuggestion`s propose moving, merging or
splitting captures.

## 4. Agent pipeline

```mermaid
flowchart LR
  A[Artifacts] --> P["Perception\ntranscribe · analyzeImage · analyzeVideo · extractDocument"]
  P --> E[Evidence]
  E --> R["Route\nscore evidence vs manifest routing hints"]
  R --> M["Match\nrecords index + structured signals"]
  M --> D["Draft\nfill module JSON Schema with provenance"]
  D --> G["Find gaps\nrequired / requiredWhen fields with no support"]
  G --> PL["Plan\norder actions, set autonomy, add links + attachments"]
  PL --> CS[ChangeSet]
```

1. **Perception** produces `Evidence` from each artifact. Demo mode: fixtures for demo artifacts;
   Web Speech transcripts, OCR (tesseract.js), PDF text (pdfjs) and quick tags for the user's own
   captures.
2. **Entity extraction** runs a gazetteer over sites, areas, assets, people and contractors (names
   plus aliases from `data/seed/org.json`), and regexes for times, dates and asset tags.
3. **Route** reads every enabled server's manifest (keywords, example situations, "use when" text)
   and scores the scenario's evidence against them to choose record types. No module names are
   hard-coded.
4. **Match** searches the records index for each routed record type, combining text similarity
   with structured signals: same asset, same area, open status, time window. Above threshold →
   update or link; below → create.
5. **Draft** fetches the record type's JSON Schema from its server and fills fields from evidence.
   Every value carries evidence IDs, a schema default, or a named derivation rule. Classifications
   look up the knowledge index and attach citations.
6. **Find gaps** walks the schema: a field that is required, or whose `x-requiredWhen` conditions
   hold, and has no support becomes a `GapQuestion` using the field's `x-gapQuestion` text.
7. **Plan** orders actions by dependency (creates before links and attachments), assigns autonomy
   from policy, and emits the `ChangeSet`.

Each step appends to the **run trace**, streamed to the Process screen over Server-Sent Events.

### Schema metadata the orchestrator reads

Record schemas are Zod schemas in `src/domain/records` converted with `z.toJSONSchema`. Field
metadata travels as JSON Schema extension keywords:

| Keyword            | Meaning                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `description`      | Human description of the field                                                  |
| `x-extractionHint` | Words or entities that usually fill it                                          |
| `x-requiredWhen`   | Conditions (`{ field, op, value }`, all must hold) that make the field required |
| `x-gapQuestion`    | Question template when it is required but unsupported                           |
| `x-picklist`       | Name of a shared picklist resource                                              |

## 5. MCP contract

Each module is an MCP server built with `@modelcontextprotocol/sdk` by one generic factory
(`src/mcp/servers/core/create-server.ts`) from a module definition (`src/mcp/servers/modules/*`):
manifest, initial statuses and picklists. Every server has the same tools and resources; only the
definition differs.

| Transport       | Used by                              | Notes                                                                     |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| In-process      | The app's gateway (default)          | Linked in-memory transport; full MCP protocol, no network                 |
| Streamable HTTP | MCP Inspector, IDEs, remote gateways | `/api/mcp/[server]`, stateless, shares the app's store                    |
| stdio           | Claude Desktop, Inspector, IDEs      | `npm run --silent mcp -- <server>`; read-only snapshot unless `--persist` |

Each server's transport is configured in `mcp.config.json`.

### Tools

| Tool              | Arguments                                                                                                                                                    | Result                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `search_records`  | `query`, `recordType`, `siteId`, `areaId`, `assetId` (also matches child items), `status` (one or many), `from` / `to` (event time), `updatedSince`, `limit` | Ranked summaries with `score`           |
| `get_record`      | `id`                                                                                                                                                         | Full record                             |
| `create_record`   | `recordType`, `payload`, `idempotencyKey`, `actor`, `changeSetId`                                                                                            | `{ record, replayed }`                  |
| `update_record`   | `id`, `patch` (`set` / `append` / `remove`), `summary`, `idempotencyKey`, `actor`, `changeSetId`                                                             | `{ record, replayed, changes }`         |
| `attach_evidence` | `recordId`, `artifactId`, `modality`, `uri`, `caption`, `provenance`, `idempotencyKey`, `actor`                                                              | `{ record, replayed }`                  |
| `link_records`    | `recordId`, `targetId`, `linkType`, `itemId`, `targetItemId`, `idempotencyKey`, `actor`                                                                      | `{ record, replayed }` (this side only) |
| `validate_record` | `mode: create` + `recordType`, `payload`; or `mode: update` + `id`, `patch`                                                                                  | `{ valid, errors[], preview }`          |

Patch paths use dots and `[selector]` for list items, where the selector matches an item's `id`,
then its `name`, then an index: `items[FE-115].response`, `findings`, `attendees[T. Nguyen].personId`.
`id`, `server`, `recordType`, timestamps, `history`, `links` and `evidence` cannot be patched.

Writes are idempotent per server and key: a retry with the same arguments returns the first result
with `replayed: true`; the same key with different arguments is an error. Errors come back as
`isError` results with `{ error, fieldErrors[] }`.

On create and append the server fills child-item ids (`HAZ-0013-CA1`, `AUD-0004-F3`,
`MTG-0006-A1`), timestamps, default statuses and `dueInDays` → `dueDate`, then validates the whole
record against its schema and against organization data (sites, areas in the record's site, assets,
people, roles, contractors, hazard categories). Every write appends a history entry with
before/after values for each changed path.

### Resources

- `ehs://{server}/manifest` — record types with display name, id prefix, **routing hints**
  (keywords, example situations, "use when", taxonomy categories), **matching hints** (strategy
  `condition` / `event` / `scheduled`, open statuses, signal fields, time window), child
  collections, and allowed link types.
- `ehs://{server}/schema/{recordType}` — the **create-payload** JSON Schema: no server-managed
  fields, `status` defaulted, child items in input form, `x-*` extraction metadata on fields.
- `ehs://{server}/picklists` — severity, risk level, hazard categories, statuses per record type,
  and module enumerations.

## 6. Gateway

```mermaid
sequenceDiagram
  participant C as Caller (review UI or workflow)
  participant G as Gateway
  participant S as MCP server
  participant L as Audit log
  participant B as Event bus

  C->>G: executeChangeSet(changeSet, actor)
  loop each action in dependency order
    G->>G: policy: role may call tool? autonomy auto / approve / blocked
    G->>S: validate_record (dry run, create/update)
    S-->>G: ok / field errors
    G->>S: write (idempotencyKey = changeSetId:actionId)
    S-->>G: record (or replayed result)
    G->>L: who, when, tool, args hash, result, latency
    G->>B: record.created / record.updated / record.linked (not on replay)
  end
  G-->>C: per-action results + updated change set
```

| Part        | File                                     | Role                                                                                                                                   |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Registry    | `gateway/registry.ts`                    | Servers from `mcp.config.json`; enable/disable at runtime                                                                              |
| Connections | `gateway/connections.ts`                 | One MCP client per server over its configured transport                                                                                |
| Discovery   | `gateway/discovery.ts`                   | Tools (namespaced `incidents.create_record`), manifests, schemas, picklists of enabled servers; cache dropped when a server is toggled |
| Policy      | `gateway/policy.ts` + `data/policy.json` | Role → tool patterns; ordered autonomy rules by action, server, record type, existing/new target                                       |
| Audit log   | `gateway/audit-log.ts`                   | Every call, including refusals and validation                                                                                          |
| Event bus   | `gateway/event-bus.ts`                   | Awaited handlers; workflow writes finish before the triggering call returns                                                            |
| Gateway     | `gateway/gateway.ts`                     | `call()`, record helpers, `link()`, `executeChangeSet()`                                                                               |

- **Record routing.** `serverFor(id)` maps an id prefix to a server using the enabled servers'
  manifests, so no prefix table is hard-coded in the gateway.
- **Links.** `link()` checks the target exists, then writes the forward link on the source's
  server and the inverse link on the target's server (`relatedTo`↔`relatedTo`,
  `causedBy`↔`resultedIn`, `foundDuring`→`resultedIn`), with item ids carried across.
- **Change sets.** Actions run in topological order of `dependsOn` plus `{ actionId }`
  references, which are resolved to the created record ids. Approve-level actions run only when
  approved; actions waiting on approval are skipped with their dependents; dependents of a failed
  action fail; independent actions continue. The change set comes back with action statuses and
  `resultRecordId`s, and running it again retries only what did not execute.

The EHS console reads the store directly (it is the mock systems' own UI) and subscribes to the
store's change feed over SSE, so it also reflects writes from external MCP clients.

## 7. RAG

Two hybrid indexes: BM25 keyword search (MiniSearch) + vector similarity (local MiniLM embeddings via
`@huggingface/transformers`, optional) + metadata filters. When embeddings are unavailable, search
falls back to BM25 + filters.

- **Records index** — every record across servers; re-indexed on each `record.*` event. Powers find
  & update and duplicate prevention.
- **Knowledge index** — SOPs and OSHA reference summaries (`data/knowledge/**/*.md`, frontmatter:
  `id`, `title`, `kind`, `cfr`, `tags`, `categories`), the hazard taxonomy and checklist templates.
  Chunks by `##` section so citations can name a section.

## 8. Workflows

Rules are JSON files in `data/workflows/`, validated by `WorkflowRule` (`src/domain/workflow.ts`):

- `trigger` — event(s), optional server and record type.
- `conditions` — field conditions on the triggering record.
- `aggregate` — optional count over recent records grouped by a field within a window.
- `forEach` — optional per-child-item evaluation with `where` filters and `unlessLinked`.
- `actions` — `notify`, `create_record`, `update_record`, `link_records`, `suggest`.

```mermaid
sequenceDiagram
  participant G as Gateway
  participant W as Workflow engine
  participant N as Notifications / suggestions

  G-->>W: record.updated (INS-0021)
  W->>W: match rules by trigger
  W->>W: forEach failed item: already linked to a hazard?
  alt not linked
    W->>G: create_record hazard + link (actor workflow:wf-…)
  else linked
    W->>W: skip (no duplicate)
  end
  G-->>W: record.updated (HAZ-0007, Dock 3)
  W->>W: aggregate: hazards in Dock 3, last 30 days ≥ 3
  W->>N: suggest "Schedule an audit of Dock 3"
```

Rule actions go through the gateway like agent actions, so they are permissioned and audited.

## 9. End-to-end sequence

```mermaid
sequenceDiagram
  actor U as Field specialist
  participant App as Capture app
  participant API as /api/agent/process
  participant O as Orchestrator
  participant G as Gateway
  participant S as MCP servers

  U->>App: capture voice + photo (offline OK)
  App->>App: store artifacts in IndexedDB
  U->>App: Process scenario
  App->>API: artifacts + scenario (SSE)
  API->>O: run
  O->>O: perception → Evidence
  O->>G: read manifests and schemas
  O->>G: search_records (match)
  O-->>App: run trace steps (streamed)
  O-->>App: ChangeSet
  U->>App: answer gaps, edit, approve
  App->>G: execute approved actions
  G->>S: validate → write
  G-->>App: record IDs, failures
  App-->>U: Results: records, link graph, workflows fired
```

## 10. Adding a module

1. Implement a server factory with the uniform tools and resources.
2. Publish a manifest with routing hints and a schema per record type.
3. Register it in `mcp.config.json` (or enable it on the Platform screen).

The router, matcher and drafter pick it up from discovery on the next run.

## 11. Data and fixtures layout

| Path                                    | Contents                                                 | Validated by        |
| --------------------------------------- | -------------------------------------------------------- | ------------------- |
| `data/seed/org.json`                    | Sites, areas, assets, roles, people, contractors         | `Organization`      |
| `data/seed/records/<server>.json`       | Seed records per server                                  | `EhsRecord[]`       |
| `data/knowledge/sops/*.md`, `osha/*.md` | Knowledge docs with frontmatter                          | `KnowledgeDocMeta`  |
| `data/knowledge/hazard-taxonomy.json`   | Hazard categories and keywords                           | `HazardTaxonomy`    |
| `data/knowledge/checklists/*.json`      | Inspection templates                                     | `ChecklistTemplate` |
| `data/workflows/*.json`                 | Workflow rules                                           | `WorkflowRule`      |
| `fixtures/scenarios/S*.json`            | Demo artifacts, perception fixtures, paraphrase variants | `ScenarioFixture`   |
| `fixtures/expected/S*.json`             | Expected change sets for evals                           | `ExpectedChangeSet` |

`tests/data.test.ts` validates every file and checks cross-references (people, areas, assets,
record IDs, artifact IDs, knowledge doc IDs, rule IDs) and the preconditions the scenarios rely on.

Perception fixtures hold what a speech, vision or document model would return (transcripts,
findings with bounding boxes, extracted text), not `Evidence`; converting them to evidence is part
of the real pipeline. Document fixture text is also the source for generating the demo PDFs.
