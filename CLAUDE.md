# Debrief — project brief and build plan

This file is the source of truth for the project. Read it at the start of every session, check the
**Progress log** at the bottom to see where things stand, and update the log when a phase (or a
meaningful chunk of one) is done.

---

## 1. What Debrief is

Debrief is a mobile-first web app: a **multimodal EHS orchestration layer**. A safety professional
describes what happened the way that is natural in the field — by voice, photo, video, documents or
notes — and Debrief converts that messy field reality into the correct, linked records and workflows
across the customer's existing EHS applications.

Target EHS applications for v1 (integrations are mocked, exposed as MCP servers):

1. Incident Management
2. Audit Management
3. Safety Meetings
4. Hazards & Observations
5. Checklists & Inspections

Core capabilities:

- **Create new records and find & update existing ones.** The agent searches existing records before
  writing, so a new photo of a known problem updates that record rather than creating a duplicate.
- **Capture many scenarios across a work day.** Users group artifacts (voice, photo, video, document,
  note) into scenarios, add to a scenario while it is happening or any time later, and only when they
  tell the agents to execute does conversion happen.
- **Human in the loop.** The agent proposes a change set; the user reviews, edits and approves before
  anything is written.

Core loop: **capture → group into scenarios → process → review change set → push → linked records +
triggered workflows.**

### Target users

- **Field safety specialist** (primary): walks the site all day, captures on a phone, often wearing
  gloves, often with poor signal.
- **Site EHS manager**: reviews what was pushed, owns corrective actions, watches trends.
- **EHS admin**: configures connected systems, autonomy rules and workflow rules.

---

## 2. Run mode: demo mode only (no API key)

There is no LLM API key for now. Everything must run locally, deterministically, with no paid
services. All AI capabilities sit behind one interface so a live LLM provider can be added later
without touching the UI, the MCP layer or the workflow engine.

```ts
// src/agents/provider.ts
interface AgentProvider {
  // Perception: turn artifacts into Evidence
  transcribe(artifact: Artifact): Promise<Evidence[]>;
  analyzeImage(artifact: Artifact): Promise<Evidence[]>;
  analyzeVideo(artifact: Artifact): Promise<Evidence[]>;
  extractDocument(artifact: Artifact): Promise<Evidence[]>;
  // Reasoning: turn Evidence into a ChangeSet
  route(ctx: ScenarioContext): Promise<RoutePlan>;
  match(ctx: ScenarioContext, plan: RoutePlan): Promise<MatchResult[]>;
  draft(ctx: ScenarioContext, target: DraftTarget): Promise<DraftRecord>;
  findGaps(ctx: ScenarioContext, drafts: DraftRecord[]): Promise<GapQuestion[]>;
  plan(ctx: ScenarioContext, drafts: DraftRecord[]): Promise<ChangeSet>;
}
```

Implementations:

- `DemoProvider` (build now) — **fixture perception + real rule-based reasoning.**
- `LlmProvider` (later, stub only) — same interface, backed by an LLM API when a key is available.

### How each capability works in demo mode

| Capability | Demo-mode implementation |
|---|---|
| Voice → text | Browser Web Speech API (live transcript while recording) + MediaRecorder keeps the audio. The user can edit the transcript. Demo scenarios use fixture transcripts. Note: Chrome/Edge speech recognition needs a network connection; offline fallback is typing. |
| Photo → findings | Demo scenario photos have **fixture findings** (what a vision model would report, incl. bounding-box regions). User's own photos: quick-tag chips from the hazard taxonomy + optional caption, plus OCR (tesseract.js) for visible text such as asset tags or signs. |
| Video → findings | Extract 3–5 keyframes in the browser (`<video>` + canvas) and treat them like photos; audio transcript from fixture or typed. |
| Document → fields | PDF text via pdfjs-dist; images of paper forms via tesseract.js (vendor `eng.traineddata` into `public/` so it works offline); template-aware parsers for known forms (sign-in sheet, extinguisher checklist). |
| Routing | Rule-based router that reads each MCP server's published **manifest** (routing hints, record types, example situations) and scores evidence against them. No module names are hard-coded in the orchestrator. |
| Entity extraction | Gazetteer matching against seeded sites, areas, assets and people; regex for times, dates, asset tags (e.g. `FL-07`, `FE-115`, `V-22`); severity and treatment keywords. |
| Find & update | Hybrid retrieval over the records index (see §6) + structured signals (same asset, same area, open status, time window). Above threshold → update/link; below → create. |
| Drafting | Fill the module's JSON Schema (fetched from its MCP server) from extracted entities. Every filled field carries evidence IDs. Required fields with no evidence become gap questions. |
| Grounding | Knowledge index lookups (SOPs, OSHA reference summaries) attach citations to classifications, e.g. recordability or fall-protection thresholds. |

**Rule: perception is the only thing faked.** Routing, matching, drafting, gap-finding, planning,
MCP calls and workflows are real code paths, which is what makes the evals meaningful. The UI shows a
small "Demo engine" badge so it is always clear what is running.

Agent steps in demo mode run with short simulated delays so the run trace animates; a setting makes
them instant.

---

## 3. Glossary

- **Modality** — the type of input: voice, photo, video, document, note. Each modality has its own
  ingestion step, and all of them output the same `Evidence` format, so nothing downstream cares where
  a fact came from.
- **Shift** — one work day; holds everything captured that day.
- **Scenario** — one situation ("Forklift near-miss, Dock 3"). Holds artifacts. Unassigned captures
  go to the **Inbox**; the agent can suggest sorting, splitting or merging.
- **Artifact** — a single capture with timestamp, site/area, optional asset tag.
- **Evidence** — an atomic fact extracted from an artifact, with provenance (transcript span, image
  region, document field) and confidence.
- **Change set** — the agent's proposal: an ordered list of create / update / link / attach actions,
  each with confidence, rationale and per-field evidence citations.
- **Provenance** — the link from every drafted field back to the evidence that supports it.
- **Run trace** — the log of every agent step and tool call for one processing run.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Field capture app (PWA)   Today · Capture · Scenario · Inbox     │
│ IndexedDB (Dexie) for artifacts + offline queue                  │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────┐
│ Ingestion (one per modality) │  voice · photo · video · document · note → Evidence
└───────────────┬──────────────┘
                ▼
┌──────────────────────────────┐      ┌───────────────────────────┐
│ Orchestrator                 │◄────►│ RAG indexes               │
│ router → matcher → drafter → │      │ records index · knowledge │
│ gap-finder → planner         │      └───────────────────────────┘
└───────────────┬──────────────┘
                ▼
┌──────────────────────────────┐      ┌───────────────────────────┐
│ Review change set (human)    │      │ Workflow engine           │
│ diff · provenance · gaps     │      │ event-driven JSON rules   │
└───────────────┬──────────────┘      └─────────────▲─────────────┘
                ▼                                   │ record events
┌──────────────────────────────────────────────────────────────────┐
│ MCP client + gateway: discovery · policy · idempotency · audit   │
└──┬──────────┬──────────┬──────────┬──────────┬───────────────────┘
   ▼          ▼          ▼          ▼          ▼          ▼ (disabled at start)
Incidents  Audits   Meetings   Hazards &   Checklists &  Training
                               Observations Inspections
```

### Design principles

1. **The orchestrator has zero module-specific code.** Everything it knows about a module comes from
   that module's MCP manifest and schemas at runtime. Adding a module = registering a server.
2. **Every write goes through the gateway.** Agent actions and workflow actions alike: permission
   check → dry-run validate → execute with idempotency key → audit log → emit event.
3. **No unsupported fields.** A drafted value without evidence (or a schema default) is a bug. Missing
   required values become gap questions instead.
4. **Offline-first capture, online processing.** Capture never needs a connection; processing and
   pushing do.
5. **Swappable everything.** Provider (demo/LLM), store (memory/DB), transport (HTTP/stdio).

---

## 5. MCP integration layer

### Servers

One mock MCP server per module, built with the official MCP TypeScript SDK
(`@modelcontextprotocol/sdk`):

| Server | Record types | ID prefix |
|---|---|---|
| `incidents` | incident | `INC-` |
| `audits` | audit (with findings) | `AUD-` |
| `meetings` | safety_meeting | `MTG-` |
| `hazards` | hazard, observation | `HAZ-`, `OBS-` |
| `inspections` | inspection (with checklist items) | `INS-` |
| `training` (disabled at start) | training_assignment | `TRN-` |

Corrective actions are child items (`correctiveActions[]`) on incidents, hazards, observations,
audit findings and inspection items, appended via `update_record`.

Each server is a factory (`createIncidentsServer(deps)`) that can be mounted three ways:

- **In-process** (the app's gateway, by default): real MCP protocol over the SDK's linked
  in-memory transport, so the app never calls itself over HTTP
- **Streamable HTTP** at `/api/mcp/[server]` (stateless) for MCP Inspector, IDEs and other clients;
  shares the app's store
- **stdio** via `npm run mcp -- incidents` so any MCP client (MCP Inspector, Claude Desktop, IDEs)
  can connect to the same mock systems (starts from the app snapshot, read-only unless `--persist`)

Each server's transport is set in `mcp.config.json` (`in-process`, `http` + url, `stdio` +
command), so the gateway can be pointed at HTTP or stdio servers without code changes.

### Uniform tool contract (every server)

| Tool | Purpose |
|---|---|
| `search_records` | Hybrid query + filters (site, area, asset, status, date range, record type) |
| `get_record` | Full record incl. links, evidence, history |
| `create_record` | Create from payload; requires `idempotencyKey` |
| `update_record` | Patch ops (`set`, `append`, `remove`); requires `idempotencyKey` |
| `attach_evidence` | Attach artifact file + provenance to a record |
| `link_records` | Cross-module link (`relatedTo`, `causedBy`, `resultedIn`, `foundDuring`) |
| `validate_record` | Dry-run validation of a create/update payload, returns field errors |

### Resources (every server)

- `ehs://{server}/manifest` — display name, description, record types, **routing hints** (keywords,
  example situations, "use when" text), allowed link types. The router reads these at runtime.
- `ehs://{server}/schema/{recordType}` — JSON Schema with required fields, picklists, field
  descriptions and extraction hints.
- `ehs://{server}/picklists` — shared enumerations (severity, status, categories).

### Gateway (`src/mcp/gateway`)

- **Registry** from `mcp.config.json` (server id, transport, url/command, enabled flag).
- **Discovery** — lists tools and reads manifests/schemas from enabled servers; tools are namespaced
  as `incidents.create_record` etc.
- **Policy** — role → allowed tools; **autonomy levels** per action type: `auto`, `approve`,
  `blocked` (e.g. attaching a photo to an existing record = auto; creating an incident = approve).
- **Execution** — validate → execute in dependency order → idempotency key
  `${changeSetId}:${actionId}` → partial-failure handling (continue independent actions, report
  failures, allow retry).
- **Audit log** — every call: who, when, tool, args hash, result, change set, latency.
- **Event bus** — emits `record.created`, `record.updated`, `record.linked` to the workflow engine.

### The "plug in a module" moment

The Platform screen lists connected servers and their discovered tools. Toggling on `training` makes
the very next processed incident propose a training assignment — with no code change, because the
router discovers the new manifest and its routing hints.

---

## 6. RAG

Two indexes, both hybrid (BM25 keyword via MiniSearch + vector similarity + metadata filters):

- **Records index** — all records across all servers (title, description, location, asset, status,
  dates). Powers find & update and duplicate prevention. Re-indexed on every `record.*` event.
- **Knowledge index** — sample SOPs, paraphrased OSHA reference summaries with CFR section numbers,
  hazard taxonomy, checklist templates. Grounds classifications and corrective-action suggestions;
  citations appear in the review screen.

Embeddings in demo mode: a small local embedding model via `@huggingface/transformers`
(e.g. all-MiniLM-L6-v2), cached after first download. If the model is unavailable, fall back to
BM25 + filters. Store vectors in memory; precompute for seed data with `npm run index`.

Knowledge content to write (short, original summaries — no copied text):

- SOPs: forklift operation & pedestrian separation, fall protection, heat stress program, portable
  fire extinguisher monthly inspection, spill response, wet-floor / housekeeping
- OSHA references: 29 CFR 1904.7 (recordability, first-aid list), 1910.157 (portable extinguishers),
  1910.178 (powered industrial trucks), 1926.501 (fall protection, construction), 1910.28 (walking-
  working surfaces)
- Hazard taxonomy (categories + keywords), checklist templates

---

## 7. Workflow automation

Declarative JSON rules in `data/workflows/*.json`, evaluated on gateway events. All rule actions also
go through the gateway (so they are permissioned and audited).

```json
{
  "id": "wf-high-severity-incident",
  "name": "High-severity incident escalation",
  "enabled": true,
  "trigger": { "event": "record.created", "server": "incidents", "recordType": "incident" },
  "conditions": [{ "field": "severity", "op": "gte", "value": 4 }],
  "actions": [
    { "type": "notify", "to": "role:site_manager", "template": "High-severity incident {{id}} at {{area}}" },
    { "type": "update_record", "target": "trigger", "patch": [
      { "op": "append", "path": "correctiveActions",
        "value": { "title": "Complete investigation", "owner": "role:site_manager", "dueInDays": 7 } }
    ]}
  ]
}
```

Starter rules:

1. High-severity incident → notify site manager + corrective action due in 7 days.
2. Failed inspection item → create linked hazard **unless the item already has a linked hazard**
   (prevents duplicates when the agent already proposed one).
3. 3+ hazards in the same area within 30 days → suggestion card: schedule an audit (aggregate
   condition: `groupBy: area, window: 30d, count >= 3`).
4. Closed incident → suggest a toolbox-talk topic for the next safety meeting.

Action types: `notify` (in-app notification feed), `create_record`, `update_record`, `link_records`,
`suggest` (creates a suggestion card that needs approval).

The agent can also **propose new rules** from patterns it sees (demo: heuristic pattern detection);
proposals appear in the admin screen for enabling.

---

## 8. Screens

Mobile-first (design at 390px wide; touch targets ≥ 48px; high contrast for outdoor use). Bottom tab
bar: Today · Capture · Review · Records · Platform.

1. **Today** — shift header, scenario cards (artifact count, AI summary line, status), big capture
   button, Inbox with unassigned captures. "Load demo day" and "Reset demo" in the menu.
2. **Quick capture** — hold-to-talk, photo, video, document, note; goes to the active scenario (or
   Inbox); create a new scenario in one tap.
3. **Scenario detail** — artifact timeline, add more any time, live summary, rename/merge/split.
4. **Process** — pick scenarios, watch the run trace stream step by step (ingest → route → match →
   draft → gaps → plan).
5. **Review** — actions grouped by scenario. Create / Update / Link / Attach badges; before/after
   diff for updates; tap any field → evidence drawer (highlighted transcript span, image region,
   document excerpt, knowledge citation); answer gap questions inline; approve all or per action.
6. **Results** — record IDs, a link graph across modules, workflows that fired, notifications.
7. **EHS console** (`/console`) — the mock systems: one tab per module, record list/detail with
   history, links, evidence. Updates live as records arrive.
8. **Platform** (`/platform`) — connected MCP servers + discovered tools, enable/disable servers,
   autonomy policy, workflow rules, audit log, run traces, eval results.
9. **Presenter view** (`/present`, desktop) — phone-sized app on the left, live EHS console on the
   right, for walkthroughs.

---

## 9. Seed data

Fictional organization: **Cedar Valley Manufacturing**

- Sites/areas: Plant 1 (Dock 1–4, Assembly Line A, Assembly Line B, Paint Booth, Break Room,
  Maintenance Shop, Mezzanine), Tank Farm, Building A (offices + warehouse)
- Assets: forklifts `FL-03`, `FL-07`, `FL-09`; extinguishers `FE-112`–`FE-130`; valves `V-20`–`V-25`;
  ice machine `IM-01`
- People: ~15 employees with roles (primary user: Maria Chen, EHS Specialist; site EHS manager:
  Dev Patel; operators, maintenance tech, line leads) + contractor **Ridgeline Steel Contractors**
  (foreman Mike Dunn)
- ~40 records with history across the five modules. Must include:
  - `HAZ-0007` open: "FL-07 right-side mirror cracked", Dock 3
  - `HAZ-0011` open: heat-related observation at Assembly Line B last week
  - `INS-0021` scheduled today: monthly fire extinguisher inspection, Building A (FE-112–FE-123)
  - `AUD-0004` in progress: contractor safety audit, Ridgeline Steel, Mezzanine expansion
  - Two older hazards in Dock 3 (so a third triggers the "3+ in 30 days" rule)

---

## 10. Demo scenarios (also the eval set)

Each scenario has: artifacts, perception fixtures (transcripts, image findings, document text), and an
**expected change set** in `fixtures/expected/`.

| # | Scenario | Captured | Expected result |
|---|---|---|---|
| S1 | Forklift near-miss, Dock 3 (08:40) | Voice: FL-07 reversing nearly clipped Luis Ortega in the pedestrian lane; mirror still cracked; tagged out. Photo: cracked mirror. | CREATE near-miss incident; UPDATE `HAZ-0007` (note, raised risk, status mitigating); LINK; ATTACH photo to both; gap question: who was operating FL-07? Rule 3 fires (third Dock 3 hazard event). |
| S2 | Slip in break room, first aid only (10:15) | Voice: Jenna Brooks slipped by ice machine, bruised knee, ice pack, back to work; machine leaking for a while. Photo: puddle, no sign. Note: "No wet floor sign out." | CREATE incident, **not recordable** (cite 1904.7 first aid — cold therapy); CREATE hazard (wet floor / `IM-01` leak) with corrective action (repair, maintenance, +3 days); LINK. |
| S3 | Heat-stress toolbox talk (13:00) | Photo of paper sign-in sheet (8 names). Voice: topic, Line B crew, 15 min, action item: second water cooler by Friday. | CREATE safety meeting with attendees matched to roster (one unmatched name → gap question), action item; LINK to `HAZ-0011`. |
| S4 | Extinguisher inspection, 2 failures (14:30) | Checklist PDF (12 units; `FE-115` gauge in red, `FE-119` blocked by pallets). Photos of both. | UPDATE `INS-0021` (completed, item responses, result fail); CREATE 2 hazards; LINK both to the inspection. Rule 2 does **not** duplicate them. |
| S5 | Contractor at height without tie-off (15:20) | Video: mezzanine deck edge, worker not tied off ~12 ft (keyframes + audio). Note: stopped work, spoke to foreman Mike Dunn. | CREATE observation (unsafe act, working at height, contractor); UPDATE `AUD-0004` (append high-severity finding, cite 1926.501); LINK. |
| S6 | Leaking valve, morning + afternoon | 07:50 Inbox note: V-22 dripping, maybe hydraulic oil. 16:10 photo in scenario "Tank farm leak": oil sheen under V-22. | Agent suggests moving the Inbox note into "Tank farm leak"; CREATE **one** hazard (fan-in, no duplicate) with corrective action citing spill-response SOP. |

### Evals (`npm run eval`)

Run every scenario through the real pipeline in demo mode and score against expected change sets:

- **Routing accuracy** — modules/record types touched
- **Action accuracy** — create vs update vs link, correct target record IDs
- **Field accuracy** — expected fields matched (normalized)
- **Unsupported fields** — drafted values with no evidence (target: 0)
- **Gap question precision** — asked only for truly missing required fields

Add 2 paraphrased variants per scenario (same facts, different wording) so the rule-based engine is
not just tuned to one transcript. Results are written to `evals/results/*.json` and shown on the
Platform screen.

---

## 11. Tech stack

- **App:** Next.js (latest stable, App Router), TypeScript (strict), Tailwind CSS, shadcn/ui
  (Radix) components, lucide icons
- **PWA:** web app manifest + service worker (Serwist or equivalent); installable; offline shell
- **Client storage:** Dexie (IndexedDB) for shifts, scenarios, artifacts (blobs), offline queue
- **State:** Zustand for UI state
- **Validation:** Zod (shared domain schemas; also used by MCP tool definitions)
- **MCP:** `@modelcontextprotocol/sdk` (servers + client), Streamable HTTP and stdio transports
- **Server store:** repository interface; default `MemoryStore` seeded from JSON, snapshotted to
  `.data/` locally; "Reset demo" restores seed. (A DB adapter can be added later.)
- **RAG:** MiniSearch (BM25) + `@huggingface/transformers` local embeddings (optional) + filters
- **Perception (demo):** Web Speech API, MediaRecorder, pdfjs-dist, tesseract.js, canvas keyframes
- **Demo docs:** pdf-lib to generate the sign-in sheet and extinguisher checklist PDFs
- **Streaming run trace:** Server-Sent Events from `/api/agent/process`
- **Tests:** Vitest (unit/integration), Playwright (a few end-to-end flows, optional)
- **Node:** 20 LTS or newer

Ask before adding heavy dependencies not listed here; record decisions in `docs/DECISIONS.md`.

### Planned structure

```
debrief/
  CLAUDE.md
  README.md
  mcp.config.json
  docs/
    PRD.md
    ARCHITECTURE.md
    DECISIONS.md
    DEMO_SCRIPT.md
  data/
    seed/            # org, sites, assets, people, records
    knowledge/       # SOPs, OSHA summaries, taxonomy, templates (markdown)
    workflows/       # JSON rules
  fixtures/
    scenarios/       # S1–S6 artifacts + perception fixtures + paraphrase variants
    expected/        # expected change sets
  public/
    demo-assets/     # demo photos, PDFs, video, keyframes
    tesseract/       # vendored OCR language data
  evals/
    run.ts
    results/
  scripts/           # seed, reset, index, generate-demo-docs, mcp (stdio launcher)
  src/
    app/             # routes: (app) Today/Capture/Scenario/Review/Results, console, platform, present, api/*
    components/
    domain/          # types + Zod schemas: Shift, Scenario, Artifact, Evidence, ChangeSet, Record, Link
    capture/         # recorders, Dexie db, offline queue
    agents/
      provider.ts
      demo/          # DemoProvider: perception fixtures + rule-based reasoning
      llm/           # LlmProvider stub
      orchestrator/  # router, matcher, drafter, gap-finder, planner, run trace
    rag/             # indexes, hybrid search, embeddings
    mcp/
      servers/       # incidents, audits, meetings, hazards, inspections, training
      gateway/       # registry, discovery, policy, executor, audit log, event bus
      store/         # repository interface + MemoryStore
    workflows/       # engine, rule schema, actions
    lib/
```

---

## 12. Build phases

Work one phase at a time. Each phase ends with typecheck + tests passing, a git commit, and a
Progress log entry.

### Phase 1 — Foundations and docs
- [x] `git init`, `.gitignore`, `.gitattributes` (LF), Prettier, ESLint
- [x] Scaffold Next.js + TypeScript strict + Tailwind + shadcn/ui; Vitest configured
- [x] `docs/PRD.md`: problem, personas, jobs to be done, user journeys, scope (v1 / later), success
      metrics, Now / Next / Later roadmap, risks and open questions
- [x] `docs/ARCHITECTURE.md`: components, data model, agent pipeline, MCP contract, gateway, RAG,
      workflows, sequence diagrams (Mermaid)
- [x] `docs/DECISIONS.md`: start the decision log (demo mode, MemoryStore, MCP-per-module, etc.)
- [x] Domain types + Zod schemas in `src/domain/`
- [x] Seed data (§9), knowledge docs (§6), scenario fixtures + expected change sets (§10)
- **Done when:** `npm run dev` shows the app shell; `npm test` validates every seed and fixture file
  against the schemas.

Success metrics to define in the PRD: time from event to complete record; % AI-drafted fields
accepted without edit; duplicate record rate; follow-up questions per record; weekly active field
users; unsupported-field rate (target 0).

### Phase 2 — Mock EHS systems over MCP
- [x] Repository interface + MemoryStore (seed, snapshot to `.data/`, reset)
- [x] Five servers with the uniform tool contract and resources (§5); `training` server disabled
- [x] `/api/mcp/[server]` Streamable HTTP route; `npm run mcp -- <server>` stdio launcher
- [x] Gateway: registry, discovery, policy, validate→execute, idempotency, audit log, event bus
- [x] EHS console UI (`/console`)
- **Done when:** MCP Inspector (`npx @modelcontextprotocol/inspector`) connects to each server and
  every tool works; console shows seeded records; tool unit tests pass.

### Phase 3 — Capture app
- [x] PWA shell, bottom tabs, Today, Scenario detail, Inbox
- [x] Quick capture for all five modalities; Dexie persistence; offline support
- [x] "Load demo day" (loads S1–S6 artifacts with their fixtures) and "Reset demo"
- **Done when:** all five capture types work on a phone over the LAN, survive reload and work offline.

### Phase 4 — Agent pipeline (demo engine)
- [x] `AgentProvider` interface; `DemoProvider` perception (§2) and reasoning
- [x] Orchestrator: router (from manifests), matcher (RAG + structured signals), drafter (from
      schemas, with provenance), gap-finder, planner (dependency order); inbox sort/merge suggestions
- [x] RAG indexes (§6)
- [x] Process screen with streamed run trace; Review screen (diff, provenance drawer, gaps,
      approvals); push via gateway; Results screen with link graph
- **Done when:** S1–S6 each produce their expected change set, push successfully, and appear in the
  console with correct links.

### Phase 5 — Platform capabilities
- [x] Workflow engine + four starter rules + rule admin UI + notifications feed
- [x] Platform screen: servers/tools, enable `training`, autonomy policy, audit log, run traces
- [x] Evals runner + paraphrase variants + results view
- **Done when:** enabling `training` makes the next incident propose a training assignment with no
  code change; `npm run eval` reports all metrics.

### Phase 6 — Polish and ship
- [x] Presenter view (`/present`)
- [x] README (setup, architecture summary, screenshots), `docs/DEMO_SCRIPT.md` (3-minute walkthrough)
- [x] Accessibility pass, Lighthouse PWA check, empty/error states
- [x] Deploy. Note: in-memory state needs a single long-running Node process (e.g. Render/Railway)
      or a hosted DB adapter; serverless platforms will not keep MemoryStore state between requests.
- **Done when:** a fresh clone runs with `npm install && npm run dev` on Windows and macOS and the
  full demo works end to end.

---

## 13. Commands (planned)

```
npm run dev          # start the app (http://localhost:3000)
npm run dev:https    # HTTPS dev server for phone testing (camera/mic need HTTPS off localhost)
npm run build        # production build
npm test             # Vitest
npm run typecheck    # tsc --noEmit
npm run lint
npm run seed         # (re)build .data/ from data/seed
npm run index        # precompute RAG indexes/embeddings
npm run eval         # run the S1–S6 eval suite
npm run mcp -- incidents   # run one mock server over stdio (MCP clients: npm run --silent mcp -- incidents)
```

---

## 14. Working agreements

- **Environment:** development is on Windows. Keep scripts cross-platform (Node scripts or rimraf,
  never `rm -rf`; `path.join`, not hard-coded slashes). Test in Edge/Chrome.
- **Phone testing:** run `npm run dev:https` (Next.js `--experimental-https`) and open the LAN URL on
  the phone; camera, microphone and speech APIs require HTTPS outside localhost.
- **Orchestrator purity:** never import anything from `src/mcp/servers/*` into `src/agents/*`. The
  agent layer only talks to the gateway.
- **Provenance always:** every drafted field carries evidence IDs or comes from a schema default; no
  invented values.
- **Determinism:** demo mode must give the same output for the same input (seeded IDs/timestamps in
  fixtures; no randomness in reasoning).
- **Tests with logic:** routing, matching, drafting, gateway policy and workflow rules get unit tests.
- **Docs tone:** README and everything in `docs/` describe the product only — problem, users,
  design, decisions and roadmap. Keep them free of commentary about why the project was built or for
  whom, beyond the product's target users.
- **Decisions:** when changing anything in this file's locked decisions, ask first, then update this
  file and `docs/DECISIONS.md`.
- **Progress:** update the log below at the end of every session.

---

## Progress log

- **2026-10-21** — Plan agreed. Run mode: demo only (no API key). Folder created with this brief.
  **Next:** Phase 1 — scaffold the app, write `docs/PRD.md` and `docs/ARCHITECTURE.md`, define domain
  schemas, and create seed data + S1–S6 fixtures.
- **2026-10-21** — **Phase 1 done.** Next.js 16.4 (App Router, React 19.3, `cacheComponents`) +
  TS strict + Tailwind 4 + shadcn/ui (Radix, Nova preset) + Vitest 5 + Prettier + ESLint; git repo
  on `main`. App shell: `(app)` route group with bottom tabs (Today · Capture · Review · Records ·
  Platform, placeholder screens) and Demo engine badge. Domain schemas in `src/domain/` (org,
  capture, evidence, records envelope + 7 record types with `x-*` JSON Schema metadata, change set,
  workflow rule, knowledge, fixtures/expected, run trace). Seed: 19 people, 29 assets, 40 records;
  6 SOPs + 5 OSHA summaries, hazard taxonomy, 3 checklist templates; 4 workflow rules; S1–S6
  fixtures with 2 paraphrase variants each + expected change sets. `npm test` (35 tests) validates
  every file and its cross-references. Decisions D-001…D-013 in `docs/DECISIONS.md`. Seed/fixture
  JSON is the source of truth (one-off generators were not kept).
  Notes for later phases: demo media under `public/demo-assets/` (paths referenced by fixtures) does
  not exist yet — Phase 3/4 (`generate-demo-docs` builds the PDFs from fixture text);
  `mcp.config.json` is Phase 2; `AGENTS.md` is written by `next dev` and points to the bundled
  Next 16 docs in `node_modules/next/dist/docs/`.
  **Next:** Phase 2 — repository interface + MemoryStore, five MCP servers, `/api/mcp/[server]`,
  stdio launcher, gateway, `/console`.
- **2026-10-21** — **Phase 2 done.** Async `RecordRepository` + `MemoryStore` (seed, `.data/store.json`
  snapshot, reset, server-side idempotency, change feed). One generic MCP server factory + six module
  definitions (manifests with routing and matching hints); uniform 7 tools, manifest / schema /
  picklist resources; schemas are create-payload JSON Schemas with `x-*` metadata. Transports:
  in-process (gateway default — decided with user, CLAUDE.md §5 updated), stateless Streamable HTTP
  at `/api/mcp/[server]`, stdio via `npm run mcp -- <server>` (read-only snapshot unless `--persist`).
  Gateway: registry (`mcp.config.json`), connection pool, discovery, policy (`data/policy.json`),
  validate→execute, idempotency `changeSetId:actionId`, audit log, event bus, cross-server links
  written on both sides, `executeChangeSet` with dependency order / approval / partial failure /
  retry. `/console` with live SSE updates and Reset demo. ESLint blocks `src/agents` importing
  servers or the store. New deps: `@modelcontextprotocol/sdk`, `minisearch`, `tsx` (approved),
  shadcn tabs/badge/card. 81 tests. Verified with MCP Inspector CLI over stdio and HTTP (all six
  servers, reads and writes). Decisions D-014…D-023. S4 expected links flipped to
  hazard `foundDuring` inspection item (D-016).
  Notes: shadcn's registry keeps adding a bogus `cn` package — remove it and point imports at
  `@/lib/utils` after every `shadcn add`. Console UI was checked via API/SSE, not visually.
  **Next:** Phase 3 — PWA shell, Today / Scenario / Inbox, five capture modalities with Dexie,
  offline, Load demo day / Reset demo.
- **2026-10-21** — **Phase 3 done (phone check pending).** Capture app: Today (shift header,
  scenario cards with summary/counts/status, Inbox preview, big Capture button), Capture (target
  picker + one-tap new scenario; hold-to-talk voice with tap-to-lock, MediaRecorder + Web Speech
  live transcript; photo/video/document via camera-capable file inputs; notes), details editor
  sheet (transcript/caption, area, asset tag, hazard quick tags), Scenario detail
  (`/scenario?id=`: rename, ready/capturing, area, capture here, timeline, move, split, merge,
  delete), Inbox (multi-select → new scenario / move). Dexie storage + `dexie-react-hooks`
  (approved), Zustand for UI state. Menu: Load demo day, Start today's shift, EHS console, Reset
  demo (local + server). Hand-written service worker (Serwist's Turbopack integration doesn't
  support Cache Components — approved), manifest + generated icons. `npm run demo-assets`: SVG
  demo photos/keyframes drawn inside fixture boxes, real checklist PDF (pdf-lib), PNG icons; demo
  voice notes play via speech synthesis, demo video via keyframes. Playwright e2e (approved stack
  item; system Edge, fake mic/camera): 5 flows pass incl. all five capture types, reload, grouping,
  offline, reset. 90 unit tests. Decisions D-024…D-029. `fake-indexeddb` was declined, so the
  Dexie layer is covered by e2e only.
  **Pending:** check on a real phone over the LAN (see README "Testing on a phone"); offline on a
  phone needs USB port forwarding or a trusted mkcert certificate.
  **Next:** Phase 4 — AgentProvider + DemoProvider, orchestrator, RAG, Process / Review / Results.
- **2026-10-21** — **Phase 4 done.** Agent pipeline in demo mode: `AgentProvider` + `DemoProvider`
  (fixture/device perception → Evidence with provenance; real rule-based reasoning) and an LLM
  stub. Orchestrator: router (manifest keywords, ≥ 2 distinct, per-asset instances for condition
  records), matcher (server `search_records` + structured signals, threshold 0.6, related open
  records as links), drafter (schema `x-fill`/`x-update` directives + EHS rules + knowledge
  citations; manifest update modes patch / append_child / complete_checklist), gap-finder,
  planner (container `foundDuring` with item ids, event hub `relatedTo`, attachments), Inbox
  sort/merge suggestions, streamed run trace. RAG: records + knowledge indexes, BM25 + filters
  behind an `Embedder` interface (embeddings deferred — agreed with user). SOP guidance rewritten
  as structured lines. On-device perception for own captures: tesseract.js OCR, pdf.js text,
  video keyframes (approved; assets vendored by `postinstall` into `public/vendor/`). APIs:
  `/api/agent/process` (SSE), `/api/agent/push`, `/api/agent/records`. Screens: Process, Review
  (collapsed cards, evidence drawer, gaps, edits, approvals), Results (grouped link graph).
  `src/evals/compare.ts` + harness: S1–S6 and all variants match their expected change sets
  (0 unsupported fields); demo-day push leaves correct two-sided links. 110 unit tests, 8 e2e
  (incl. full process→review→push→console, PDF and OCR own-capture paths). Decisions D-030…D-036.
  Workflow expectations in `fixtures/expected` are not checked yet (Phase 5).
  **Next:** Phase 5 — workflow engine + four rules + notifications, Platform screen (servers,
  enable `training`, policy, audit log, run traces), `npm run eval` with metrics.
- **2026-10-21** — Phase 5 done. Workflow engine (`src/workflows/`): four starter rules from
  `data/workflows/`, fresh-read conditions, aggregate/forEach/unlessLinked, rule writes through
  the gateway as `workflow:<id>`, chain depth 4 tagged with the originating change set,
  suggestion dedupe, notification/suggestion/evaluation feed. Gateway events are batched until a
  change set finishes (so rule 2 never duplicates S4's hazards). Heuristic rule proposals
  (category and asset patterns, disabled until enabled). Training plugs in with no orchestrator
  change (manifest keywords + generic `trainingDue` fill rule). `/api/platform` + Platform screen
  (Systems, Workflows, Activity, Policy, Audit, Runs, Evals), header notification bell, Results
  "Workflows" section. `npm run eval`: 18/18 cases, every metric 100%, 0 unsupported fields, 0
  duplicates (variants are a robustness check, not a held-out set). 118 unit tests, 9 e2e.
  Decisions D-037…D-042.
  **Next:** Phase 6 — presenter view, README screenshots + `docs/DEMO_SCRIPT.md`, accessibility
  and Lighthouse PWA pass, empty/error states, deploy (single long-running Node process).
- **2026-10-21** — **Phase 6 mostly done; deploy pending the user.** Presenter view (`/present`):
  script steps (`src/components/present/script.ts`) drive a phone-sized app iframe and a live
  console/Platform iframe; console links from the phone open in the side pane.
  `docs/DEMO_SCRIPT.md` (3-minute walkthrough + troubleshooting), README (screenshots in
  `docs/screenshots/`, how-it-works summary, presenter, deploying). Accessibility:
  `@axe-core/playwright` (approved dev dep) checks every screen at WCAG 2.1 AA; fixed contrast,
  voice-button naming and nested links in the link graph. Lighthouse 12 via npx (approved, not a
  dep): a11y/best practices/SEO 100, performance 79–86 simulated mobile; installability confirmed
  via CDP (no PWA category in Lighthouse 12). Empty/not-found states now lead somewhere; Records
  tab lists pushed records. Deploy: `render.yaml` (approved: Render) + `/api/health`. Fresh clone
  verified on Windows: `npm ci`, build, start, all routes 200, `npm run eval` 18/18. 118 unit
  tests, 11 e2e (phone + desktop projects). Decisions D-043…D-046.
  **Pending:** connect the repo in Render (New → Blueprint) and run the demo on the hosted URL;
  macOS fresh-clone check; real-phone check from Phase 3 (easier on the hosted HTTPS URL).
  Optional later: real demo audio/video via ffmpeg (today: speech synthesis and keyframes).
- **2026-10-22** — **Deployed** on Render (blueprint from `render.yaml`):
  https://debrief-zhn0.onrender.com (presenter: `/present`). Full e2e suite passes against it
  (`E2E_BASE_URL=https://debrief-zhn0.onrender.com npx playwright test`; note it resets the hosted
  demo). Fixed a race the deploy test exposed: on dates after the demo day, a fresh frame creating
  today's shift could override Load demo day — check-and-create is now one IndexedDB transaction.
  Demo-day cache warm-up no longer requests the missing voice/video files. Cloudflare in front of
  Render does not cache HTML (`cf-cache-status: DYNAMIC`), so redeploys are safe.
  **Pending:** macOS fresh-clone check; real-phone check on the hosted URL.
