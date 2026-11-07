# Debrief — progress log

Newest entries at the bottom. Append one at the end of every working session.

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
- **2026-10-26** — Hosted demo showed a failed training create: "Who should take this training?"
  was left unanswered and assignees are schema-required. Gap questions now carry `blocking`
  (schema-required); Review holds Push until blocking questions on approved actions are
  answered or the action is rejected; gateway validation errors name the fields (D-047). Demo
  script updated. Unit + e2e (local and hosted) pass.
- **2026-10-26** — Follow-up: answering the training question still failed, because the person
  picker's single ID was written into the `assigneeIds` list field as a string. Gaps now carry
  `multiple`; answers go through `applyGapAnswer` (shared by Review and tests), which wraps list
  answers (D-048). The earlier unit test had bypassed the UI answer path and the e2e test did not
  check the training result; both now do.
- **2026-11-07** — CLAUDE.md cut to ~235 words (summary, status, pointers, commands, rules). The
  original brief moved verbatim to `docs/BRIEF.md` and this log to `docs/PROGRESS.md` (D-049).
- **2026-11-07** — Jobs-to-be-done documents in `docs/jtbd/` (index + one per PRD §4 job) with
  Given/When/Then acceptance criteria, each with a status and the test or eval that verifies it.
  Open items surfaced: retry of failed actions from the app (AC-3.7), accepting a suggestion
  creates the follow-up record (AC-6.7), inline edit of boolean/choice classifications (AC-5.6),
  in-app module registration (AC-7.8); not covered by tests: AC-1.10, AC-5.7, AC-6.5.
