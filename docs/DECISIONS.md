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
rules must and must not act. Link direction in S1–S3 uses `relatedTo`; inspection items link to
their hazards with `resultedIn`; observations link to audits with `foundDuring`.
**Consequences.** One expected file applies to all paraphrase variants of a scenario.
