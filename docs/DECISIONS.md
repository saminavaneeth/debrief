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
