# Debrief

Mobile-first EHS orchestration app: field captures (voice, photo, video, document, note) →
scenarios → agent-proposed change set → human review → linked records in mock EHS systems
(MCP servers) + workflows. Demo mode only: fixture perception, real rule-based reasoning.

**Status:** Phases 1–6 done; deployed at https://debrief-zhn0.onrender.com (`/present`).
Read `docs/PROGRESS.md` (latest entries) at session start; append an entry at session end.

## Where things are

- `docs/BRIEF.md` — full spec: data model, MCP contract, workflows, screens, seed data,
  S1–S6 scenarios, stack
- `docs/ARCHITECTURE.md` — how it is built · `docs/DECISIONS.md` — decision log (D-001…)
- `docs/PRD.md` — product · `docs/DEMO_SCRIPT.md` — walkthrough

## Commands

`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run eval` ·
`npm run test:e2e` (`E2E_BASE_URL=<url>` targets a deploy and resets its demo) ·
`npm run mcp -- <server>`

## Rules

- Windows dev: cross-platform scripts (Node, `path.join`), test in Edge/Chrome.
- Ask before adding dependencies or changing a locked decision; record decisions in
  `docs/DECISIONS.md`.
- `src/agents/*` never imports `src/mcp/servers/*` or the store; it talks to the gateway only.
- Every drafted field has evidence or a schema default; demo mode is deterministic.
- Unit-test logic (routing, matching, drafting, policy, workflows); e2e must exercise the
  real UI path.
- Docs describe the product only.
- Before committing: typecheck, lint, tests, evals pass. Commit trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pushing `main` redeploys Render
  (resets hosted demo data).
- After `shadcn add`: remove the bogus `cn` package; import `cn` from `@/lib/utils`.
