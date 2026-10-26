# Decision log

Newest last. Each entry: context, decision, consequences.

## D-001 · Demo mode only, behind a provider interface — 2026-10-21

**Context.** No LLM API key is available. The product must run locally, deterministically and
without paid services.
**Decision.** All AI capabilities sit behind `AgentProvider`. `DemoProvider` fakes perception only
(fixtures for demo artifacts; Web Speech, OCR, PDF text and quick tags for user captures). Routing,
matching, drafting, gap-finding, planning, MCP calls and workflows are real code. `LlmProvider`
exists as a stub. The UI always shows a "Demo engine" badge.
**Consequences.** Evals measure real reasoning code. Demo output is reproducible. A live provider
can be added without touching UI, gateway or workflows.

## D-002 · One mock MCP server per EHS module — 2026-10-21

**Context.** The orchestrator must work against several independent EHS applications and accept
new ones without code changes.
**Decision.** Each module is a separate MCP server with a uniform tool contract and manifest /
schema / picklist resources, mountable over Streamable HTTP and stdio.
**Consequences.** The orchestrator has no module-specific code. Any MCP client can inspect the mock
systems. Enabling the training server demonstrates runtime discovery.

## D-003 · All writes through one gateway — 2026-10-21

**Decision.** Agent actions and workflow actions both go through the gateway: permission check →
dry-run validation → execute with idempotency key `${changeSetId}:${actionId}` → audit log → event.
**Consequences.** One place for policy, autonomy levels, retries and audit.

## D-004 · MemoryStore seeded from JSON — 2026-10-21

**Decision.** A repository interface with a default in-memory store seeded from `data/seed`,
snapshotted to `.data/` (git-ignored); "Reset demo" restores the seed.
**Consequences.** No database to install. Deployment needs a single long-running Node process (or a
DB adapter later); serverless hosting would not keep state.

## D-005 · Next.js 16 App Router, Tailwind 4, shadcn/ui (Radix, "nova" preset) — 2026-10-21

**Context.** The brief asks for the latest stable Next.js with Tailwind and shadcn/ui.
**Decision.** Scaffolded with `create-next-app` (Next 16.4, React 19.3, Tailwind 4 via the
Turbopack loader, `cacheComponents` enabled) and `shadcn init` with the Radix base and Nova preset.
The app tabs live in the `(app)` route group.
**Consequences.** shadcn brings `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`,
`tw-animate-css` and the `shadcn` package (for its Tailwind CSS layer). The init step also added a
package named `cn`; it was removed and `src/lib/utils.ts` uses the standard clsx + tailwind-merge
helper.

## D-006 · Tooling: Vitest, Prettier, ESLint, Node types — 2026-10-21

**Decision.** Vitest 5 (`vitest.config.mts`, `@` alias), Prettier with
`prettier-plugin-tailwindcss` (class sorting), ESLint flat config from `eslint-config-next` plus
`eslint-config-prettier` (turns off rules that conflict with Prettier). `@types/node` is 24.x
because Vitest 5's peer range excludes 20.x types; the runtime requirement stays Node ≥ 20.
`npm run typecheck` runs `next typegen` first so route types such as `LayoutProps` exist.
**Consequences.** `.gitattributes` forces LF; Prettier ignores `CLAUDE.md`, generated output and
`public/`.

## D-007 · Zod 4 schemas are the single source for record JSON Schemas — 2026-10-21

**Context.** Servers must publish JSON Schemas that the drafter and gap-finder read at runtime.
**Decision.** Record types are Zod schemas in `src/domain/records`; servers convert them with
`z.toJSONSchema`. Field metadata the orchestrator needs (`x-extractionHint`, `x-requiredWhen`,
`x-gapQuestion`, `x-picklist`) is attached with `.meta()` and appears in the JSON Schema output.
**Consequences.** Seed validation, server validation and published schemas cannot drift. Conditional
requirements (e.g. operator required for a near miss involving equipment) are data, not code.

## D-008 · Flat record envelope; child items addressed by id — 2026-10-21

**Decision.** Shared envelope fields plus flat type-specific fields; `notes`, `correctiveActions`,
`links`, `evidence` and `history` on every record. Child items (inspection items, audit findings)
have stable ids; asset-based inspection items use the asset tag as id. Patch paths use
`items[FE-115].response`.
**Consequences.** Short, readable patch paths and diffs. Links from child items carry `itemId`, which
lets the failed-item rule detect an existing hazard link.

## D-009 · Links stored on both records — 2026-10-21

**Decision.** `link_records` writes the link on both records (e.g. `resultedIn` from the inspection
item, `foundDuring` on the hazard). Seed data follows the same rule and tests enforce it.
**Consequences.** Either record shows its links without a reverse lookup.

## D-010 · Fixed demo date and offset — 2026-10-21

**Decision.** Seed data and fixtures use a fixed demo day, 2026-10-21, with timestamps at UTC−05:00
(America/Chicago in October). Relative due dates in expected change sets are computed from
`demoDate`.
**Consequences.** Deterministic evals. Loading the demo day on another date may later shift
timestamps relative to "today"; the stored fixtures stay fixed.

## D-011 · Repeat-hazard rule counts hazard activity, not only creation — 2026-10-21

**Context.** S1 updates the existing Dock 3 hazard rather than creating one, yet should trigger the
"3+ hazards in an area within 30 days" rule.
**Decision.** The aggregate counts distinct hazards in the area whose creation or latest update falls
within the window (`activity: "created_or_updated"`). Seed data has exactly two active Dock 3
hazards in the window (HAZ-0010, HAZ-0012); HAZ-0007 was last updated before it.
**Consequences.** S1's update of HAZ-0007 makes the third and fires the rule; no other area starts at
the threshold (enforced by a test).

## D-012 · Perception fixtures are model outputs, not Evidence — 2026-10-21

**Decision.** Fixtures store what a speech, vision or document model would return (transcripts,
findings with boxes, OCR / PDF text). Converting them into `Evidence` with provenance is part of the
real pipeline. Paraphrase variants override transcripts and note text only. Document fixture text is
also the source for the generated demo PDFs.
**Consequences.** The eval exercises evidence extraction, not just downstream logic. Variants test
wording robustness without new images.

## D-013 · Expected change sets describe outcomes, not exact payloads — 2026-10-21

**Decision.** Expected actions list type, target and key fields: `fields` (exact after
normalization), `fieldsContain` (case-insensitive substring) and `includes` (an array element must
match). `forbidden` caps creates of a record type (duplicate prevention); `workflows` states which
rules must and must not act. Link direction in S1–S3 uses `relatedTo`; hazards and observations link to the inspection item or
audit they were found during with `foundDuring` (see D-016).
**Consequences.** One expected file applies to all paraphrase variants of a scenario.

## D-014 · The gateway reaches servers in-process by default — 2026-10-21

**Context.** The brief had the app's gateway call the servers over the Streamable HTTP route. That
means the app calls itself over HTTP: it needs to know its own URL and port, fails during build and
tests, and adds latency.
**Decision.** Each server's transport is set in `mcp.config.json`. The default is `in-process`: the
gateway gets an MCP `Client` connected to a freshly built server over the SDK's linked in-memory
transport — the full MCP protocol, no network. `http` (url) and `stdio` (command) are supported per
server. The HTTP route stays available for MCP Inspector, IDEs and other clients.
**Consequences.** Tests, scripts and the app use the same code path. Pointing the gateway at a
remote or stdio server is a config change.

## D-015 · Stateless HTTP route; stdio starts read-only — 2026-10-21

**Decision.** `/api/mcp/[server]` builds a new server instance per request (stateless Streamable
HTTP, JSON responses) over the process-wide store. `npm run mcp -- <server>` loads the latest
`.data/store.json` (or seed) and keeps writes in its own process unless `--persist` is passed.
**Consequences.** HTTP clients see and change the same records as the app. A stdio server cannot
silently overwrite the app's snapshot. MCP clients should launch it with `npm run --silent mcp --`
(or `npx tsx scripts/mcp.ts`), because `npm run` prints a banner on stdout.

## D-016 · Cross-module links: the gateway writes both sides — 2026-10-21

**Context.** A link between an incident and a hazard spans two servers; a server should only write
its own records.
**Decision.** `link_records` writes one side only (`recordId`, `targetId`, optional `itemId` and
`targetItemId`). The gateway's `link()` checks the target exists, then writes the forward link on
the source server and the inverse on the target server (`LINK_INVERSE`: relatedTo↔relatedTo,
causedBy↔resultedIn, foundDuring→resultedIn). Idempotency keys are `key` and `key:inverse`.
Because `resultedIn` has two possible inverses, links are created from the side whose type is
unambiguous: a hazard is `foundDuring` an inspection item (the inspection gets `resultedIn` with
`itemId`). The S4 expected change set and the HAZ-0007 seed link follow this.
**Consequences.** No server writes another module's records. The failed-item workflow rule can see
an inspection item's hazard through `itemId`.

## D-017 · Published schemas are create-payload schemas — 2026-10-21

**Decision.** `ehs://{server}/schema/{recordType}` is the record schema without server-managed
fields (id, server, recordType, timestamps, createdBy, history, links, evidence), with `status`
defaulted to the module's initial status, and child items in input form: corrective actions,
findings, action items and notes may omit ids, timestamps and default statuses, and corrective
actions may give `dueInDays` instead of `dueDate`. The server fills these on create and on
`append`, then validates the whole record (schema, then references to sites, areas, assets, people,
roles, contractors and hazard categories).
**Consequences.** The drafter fills exactly what the schema asks for. Workflow rules can use
relative due dates.

## D-018 · Tool argument schemas keep payloads and patch values free-form — 2026-10-21

**Context.** MCP Inspector's strict mode warns that `create_record.payload` and patch `value`
accept any value.
**Decision.** Keep them free-form in the tool input schema. The contract for a payload is the
published record schema, checked by the server and by `validate_record`; Zod's `z.json()` would
render as recursive `$defs`, which is less portable than the warning.
**Consequences.** Four strict-mode warnings across three tools; no errors.

## D-019 · Policy file and approval semantics — 2026-10-21

**Decision.** `data/policy.json` holds role → tool patterns (`*`, `server.*`, `*.tool`) and ordered
autonomy rules matched on action type, server, record type and whether the target is existing or
new; `defaultAutonomy` is `approve`. Attach is `auto`; creating an incident and everything else is
`approve`. The executor re-checks policy for every action: `blocked` fails, `approve` runs only
when the action's status is `approved`, `auto` runs either way. Actions awaiting approval are
skipped, and so are their dependents; dependents of a failed action fail. Re-running the returned
change set retries only what did not execute.
**Consequences.** The planner's autonomy label is advisory; the gateway enforces.

## D-020 · Gateway events and the console's change feed are separate — 2026-10-21

**Decision.** The gateway emits `record.created / updated / linked` for its own writes (not for
idempotent replays); workflows subscribe to these. The EHS console is the mock systems' own UI: it
reads the store directly and listens to the store's change feed over SSE
(`/api/console/events`), so it also updates when an external MCP client writes through the HTTP
route.
**Consequences.** Writes made directly over HTTP or stdio do not trigger workflows; agent and
workflow writes do.

## D-021 · `tsx` for scripts — 2026-10-21

**Decision.** Added `tsx` (dev) to run `scripts/*.ts` with the project's `@/` path aliases on
Node 20+ (`npm run seed`, `npm run mcp`, later `index` and `eval`).

## D-022 · `search_records` builds a MiniSearch index per call — 2026-10-21

**Decision.** Each call filters the server's records by the structured filters, then ranks them
with a MiniSearch index (prefix + fuzzy, title and asset tags boosted) built for that call.
**Consequences.** Always consistent with the store, cheap at demo scale. The cross-server records
index with embeddings (Phase 4) lives in `src/rag` and is separate.

## D-023 · Audit log is in memory — 2026-10-21

**Decision.** The audit log keeps the last 5,000 gateway calls in memory and is cleared by "Reset
demo". It is not written to `.data/`.
**Consequences.** Restarting the app clears the audit log but not the records. Persisting it is a
small change if needed.

## D-024 · Hand-written service worker instead of Serwist — 2026-10-21

**Context.** The brief allows "Serwist or equivalent". Serwist's Turbopack integration
(`@serwist/turbopack`) exports `dynamic = "force-static"` route config, which Next 16 rejects when
Cache Components is on, and its webpack plugin does not run under Turbopack.
**Decision.** `public/sw.js` (no dependency). On install it fetches every app route, caches the
HTML and the `/_next/` scripts and styles each page references. Pages are network first with a
3.5 s timeout and fall back to the cached page, ignoring the query string (so `/scenario?id=…`
works for any id). Hashed assets are cache first (network first in dev), demo assets and icons
cache first, `/api/*` network only. React Server Component requests are not intercepted; when they
fail offline, the router falls back to a full page load, which the worker serves. Registered on
every page by `ServiceWorkerRegistration`; `NEXT_PUBLIC_DISABLE_SW=1` turns it off.
**Consequences.** Offline works after one online visit. Bump `VERSION` in `sw.js` when its
caching rules change.

## D-025 · Client storage and state — 2026-10-21

**Decision.** Dexie database `debrief` with tables `shifts`, `scenarios`, `artifacts`, `blobs`
(media, separate so listing is cheap), `perception` (demo perception fixtures for Phase 4),
`settings` (active shift, capture target, last area) and `queue` (work waiting for a connection,
used from Phase 4). Screens read through `dexie-react-hooks` (`useLiveQuery`) so every screen
updates as soon as a capture is written. Zustand holds only transient UI state (editor sheet,
notices). Captures are written before any editing, and the app asks for persistent storage on
first capture. Each capture's object URL is created once and revoked when it is deleted.
**Consequences.** Captures survive reloads and never need a connection. Grouping logic
(merge/split planning, summaries, demo-day construction) is pure and unit-tested; the Dexie layer
is covered by the end-to-end tests.

## D-026 · Scenario detail is `/scenario?id=…` — 2026-10-21

**Decision.** A single static route with a query parameter instead of `/scenarios/[id]`.
**Consequences.** The page is prerendered and cached by the service worker, so any scenario
opens offline. Scenario ids only exist on the device, so there is nothing to render on the server.

## D-027 · Demo media: SVG illustrations, a real PDF, no audio or video files — 2026-10-21

**Context.** No camera footage, and no ffmpeg on the build machine.
**Decision.** `npm run demo-assets` draws each demo photo and video keyframe as an SVG, with the
key element inside the fixture finding's bounding box, labelled "Demo illustration". The
extinguisher checklist is a real PDF built with pdf-lib from the fixture text. App icons are PNGs
from a small built-in encoder. Demo voice notes play their transcript with the browser's speech
synthesis; the demo video plays as its keyframes. Real files dropped at the same paths take over.
**Consequences.** Fixture image paths changed from `.jpg` to `.svg`. Evidence regions line up with
the pictures in the review screen.

## D-028 · End-to-end tests with Playwright on the system browser — 2026-10-21

**Decision.** `npm run test:e2e` builds the app, starts it on port 3210 with its own snapshot
(`DEBRIEF_SNAPSHOT`), and drives the installed Edge (`PW_CHANNEL=chrome` for Chrome) at 390×844
with a fake microphone and camera. Covered: demo day, all five capture types, persistence across
reload, new/rename/split/merge/move, offline use through the service worker, Reset demo.
`SCREENSHOTS=1` captures the main screens.
**Consequences.** No browser download. Live speech recognition itself is not tested (it needs the
browser's online service); the transcript is typed in the test.

## D-029 · Phone testing over HTTPS — 2026-10-21

**Decision.** `npm run dev:https` serves on all interfaces with a self-signed certificate;
`allowedDevOrigins` admits private-network hostnames in development. Camera, microphone and speech
work after accepting the certificate warning, but browsers do not register service workers on a
certificate error, so offline testing on a phone uses either USB port forwarding
(`chrome://inspect` → localhost) or a certificate the phone trusts (mkcert with the LAN IP, passed
via `--experimental-https-key/-cert`).

## D-030 · Module knowledge lives in schema directives and manifests — 2026-10-21

**Context.** The orchestrator must have zero module-specific code, yet it has to know that a
near miss needs an operator, that a hazard update may raise its risk, or that an audit gains a
finding.
**Decision.** Each record schema field can carry `x-fill` (how to fill it on create) and
`x-update` (how new evidence changes it), from a fixed vocabulary in `src/domain/drafting.ts`:
title, statements, site, area, assets, contractor, capturer, eventTime, enumKeywords, flag,
person, people, category, rule, actions, context, guidance, regulation, documentField, duration,
roster, actionItems; and enumKeywords, raiseIfLinked, note for updates. Each manifest record type
declares its title template, its update mode (`patch`, `append_child`, `complete_checklist`) and
whether it is a link container (`foundDuring` target). The drafter interprets these; named EHS
rules (severity, injury, recordability, risk) live in `src/agents/orchestrator/rules.ts` and know
nothing about modules.
**Consequences.** A new module brings its own drafting behaviour through its schema and manifest.
Tests check that directives survive into the published JSON Schemas.

## D-031 · Routing, instances and matching — 2026-10-21

**Decision.** A record type is proposed when at least two distinct routing keywords from its
manifest match non-negated evidence. Condition records (hazards, open audits) get one instance per
subject asset; when there is a single subject (or the scenario mentions exactly one asset), the
whole scenario is in scope. Events and scheduled records get one instance per scenario. Matching
searches each server's open records and scores structured signals (same asset 0.55, area 0.2,
category 0.2, contractor 0.45, keyword rank 0.15; scheduled date 0.4 + share of checklist assets
0.5; events must fall inside the manifest's time window). Score ≥ 0.6 updates, otherwise creates.
Open condition records in the same area and category that the scenario does not already touch are
proposed as links only (S3 → HAZ-0011).
**Consequences.** Find-and-update and duplicate prevention come from structured signals, so
paraphrased transcripts still match. Thresholds are constants in the router and matcher.

## D-032 · Planning: hubs, containers and attachments — 2026-10-21

**Decision.** If a container record (inspection, audit) is in the scenario, every other record
links to it with `foundDuring`, naming the matching child item (`toItemId`). Otherwise the first
new event record (incident, observation, meeting) is the hub and links `relatedTo` everything
else and any related open records. Photos and videos attach to every record that cites them; a
document attaches to the record that cites most of it. Creates, then updates, then links, then
attachments; references to new records use `actionId`.
**Consequences.** S1–S6 produce their expected links, including inspection item links that the
failed-item workflow rule can see.

## D-033 · Hybrid search without embeddings for now — 2026-10-21

**Context.** The brief lists optional MiniLM embeddings via `@huggingface/transformers`.
**Decision (agreed with the user).** The records and knowledge indexes use MiniSearch (BM25,
prefix and fuzzy) plus metadata filters, behind an `Embedder` interface and a `hybridScore` that
already blends vector similarity when one is supplied. No model is downloaded.
**Consequences.** Fully offline and deterministic. Adding embeddings is a new `Embedder`
implementation.

## D-034 · Knowledge guidance lines are structured — 2026-10-21

**Decision.** Each SOP's "Corrective action guidance" section is a list of
`situation → action | owner: … | due: N days | keywords: …` lines. The drafter proposes the
best-matching line for the record's category plus any other line matching at least two of its
keywords (max three), with a real due date and the line as citation. Regulation references come
from the regulation section whose heading names a paragraph (e.g. 1926.501(b)(1)).
**Consequences.** Corrective actions and requirement references are traceable to a specific line
or paragraph.

## D-035 · Perception for the user's own captures runs on the device — 2026-10-21

**Decision (agreed with the user).** Photos and photographed forms are read with tesseract.js;
PDFs with pdf.js (lines with three or more wide gaps become `a | b | c` table rows); videos give
four keyframes (stored as blobs on the device); quick tags and captions become findings. Results
are cached in IndexedDB and sent with the scenario. Worker, wasm cores, the `best_int` English
model and the pdf.js worker are copied into `public/vendor/` by a `postinstall` script (not
committed, served locally, no CDN).
**Consequences.** Own captures produce evidence beyond transcripts and notes (tested end to end:
a PDF checklist completes INS-0021; an OCR'd asset plate matches HAZ-0007).

## D-036 · Processing, review and push flow — 2026-10-21

**Decision.** `POST /api/agent/process` streams the run trace as SSE and returns the change set,
evidence and cited knowledge titles; the client stores them as a run in IndexedDB, where review
edits, gap answers and approvals are saved. `POST /api/agent/push` executes the change set through
the gateway. Scenarios are processed oldest first, so record numbers follow the order of events.
Fields are edited inline only for free text and numbers; people, places and times change through
gap questions or re-processing. Review cards are collapsed with a one-line summary.
**Consequences.** A review survives reloads. Processing needs a connection; captures do not.

## D-037 · Gateway events are delivered after a change set finishes — 2026-10-21

**Decision.** During `executeChangeSet`, `record.*` events are queued (AsyncLocalStorage) and
delivered once all actions have run. Writes made by event handlers are delivered immediately.
**Consequences.** Rules see the complete result of a push. The failed-inspection-item rule sees
the hazards the agent already linked, so it does not create duplicates.

## D-038 · Workflow engine semantics — 2026-10-21

**Decision.** Conditions are evaluated on a fresh read of the record through the gateway. Rule
writes run as actor `workflow:<rule id>` with idempotency keys derived from rule, record, item,
action and originating change set. Rules can chain to a depth of 4; each firing records the
change set that started the chain. Suggestions with the same key (aggregates: rule + group value)
are not repeated while one is open. Notifications are resolved from roles to people in the org.
**Consequences.** Results can list the workflows a push caused; repeated events are harmless.

## D-039 · Rule proposals are heuristic and disabled until enabled — 2026-10-21

**Decision.** In demo mode the agent proposes rules from two patterns over the last 60 days: 3+
hazards in one taxonomy category, and one asset appearing in 2+ record types on different days.
A proposal is a complete rule, stored disabled, with its rationale and source records; an admin
enables or dismisses it on the Platform screen.
**Consequences.** No rule goes live without a person; an LLM provider can replace the heuristics
behind the same proposal shape.

## D-040 · Training plugs in through its manifest and schema only — 2026-10-21

**Decision.** The training server's manifest carries the routing keywords and drafting hints; its
schema's `dueDate` uses a new generic fill rule, `trainingDue` (+14 days). The assignee is a gap
question. The orchestrator has no training-specific code.
**Consequences.** Enabling `training` makes the next forklift incident propose a linked training
assignment (unit and e2e tested); other scenarios are unaffected.

## D-041 · Evals run the full pipeline and push — 2026-10-21

**Decision.** `npm run eval` runs each scenario and paraphrase variant on a fresh in-memory
runtime, compares with the expected change set, approves all, pushes, and checks expected
workflow outcomes. Reports go to `evals/results/` and are not committed; the Platform screen shows
`latest.json` and can rerun the suite.
**Consequences.** The variants check robustness to wording; they were written alongside the rules,
so they are not a held-out test set.

## D-042 · Platform API — 2026-10-21

**Decision.** One route, `/api/platform`: GET returns the full admin state (or a small summary for
the header bell, or the workflow activity of one change set); POST takes a typed action (toggle a
server or rule, set an autonomy level, scan or enable proposals, resolve suggestions, mark
notifications read, run evals). Reset demo also restores server flags, policy and rules.
**Consequences.** The Platform screen, the header bell and Results share one source of state.

## D-043 · Presenter view frames the real app — 2026-10-21

**Decision.** `/present` shows the demo script, the capture app in a phone-sized iframe and the
EHS console or Platform in a second iframe, all same-origin, so they share IndexedDB and the
server state. Console links opened in the phone are moved to the right-hand pane. Script steps
live in `src/components/present/script.ts` and are mirrored in `docs/DEMO_SCRIPT.md`.
**Consequences.** The walkthrough uses the same screens a user sees; no presenter-only copy of the
app to keep in sync. Below 1024 px the view points to the app instead.

## D-044 · Automated accessibility checks in the e2e suite — 2026-10-21

**Decision (agreed with the user).** `@axe-core/playwright` (dev dependency) checks every main
screen, the evidence drawer, each Platform tab, the console and the presenter against WCAG 2.1 A
and AA; the test fails on any violation. Lighthouse was run once (not a dependency): accessibility,
best practices and SEO 100; performance 79–86 on simulated mobile, limited by content that renders
after hydration from IndexedDB. Lighthouse 12 has no PWA category; installability was confirmed
with the browser's own installability check.
**Consequences.** Link-graph nodes are a pointer shortcut only; the record list under the graph is
the accessible way to open a record. The voice button's accessible name is its visible text.

## D-045 · Records tab lists what this device pushed — 2026-10-21

**Decision.** The Records tab shows records created or updated by each push from this device,
grouped by push, with titles and statuses fetched from the gateway and links to the console.
**Consequences.** IDs are still shown offline; titles need a connection.

## D-046 · Deploy as one Node web service on Render — 2026-10-21

**Decision (agreed with the user).** `render.yaml` defines a single Node web service
(`npm ci && npm run build`, `npm start`, health check `/api/health`, Node 22). State stays in the
in-memory store with its snapshot on the instance disk.
**Consequences.** A restart (deploy, or the free plan waking from sleep) starts from the seed
data. Persistent state across restarts needs a database adapter behind the repository interface.

## D-047 · Blocking gap questions hold the push — 2026-10-26

**Decision.** A gap question is `blocking` when its field is in the target schema's `required`
list, so the system would reject the record without it. Conditionally required values
(`x-requiredWhen`, e.g. the forklift operator) are not blocking: the record can be written and
completed later. Review disables **Push** while an action that would be pushed has an
unanswered blocking question, lists those questions and jumps to each one; rejecting the action
also clears the hold. Gateway validation errors now name the failing fields.
**Consequences.** A known-invalid record never reaches the gateway, and the action fails
visibly in review instead of as a partial push with dependent link and attach failures.
