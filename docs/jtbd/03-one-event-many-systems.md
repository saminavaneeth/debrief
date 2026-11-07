# JTBD-3 · One event, many systems

> When one event touches several systems, I want all the records created and linked in one step.

**Persona:** field safety specialist (Maria). **Journeys:** J1 and J2 (incident and hazard),
J4 (inspection and hazards), J5 (observation and audit finding).

## Situation

A near miss belongs in the incident system, updates a hazard and needs the photo on both. A
failed inspection item needs a hazard linked back to the item. Today each system is updated
separately, and the links between them live in people's heads, so root causes and trends are
hard to see.

**Motivation:** do the paperwork once. **Expected outcome:** every record the event needs exists,
each points to the others, and the evidence is attached where it belongs.

## How Debrief does the job

- Processing a scenario produces one **change set**: an ordered list of create, update, link and
  attach actions across all connected systems.
- After review, **Push** writes the whole change set through one gateway: permission check →
  validation → write with an idempotency key → audit → event.
- Actions run in dependency order, so links and attachments can point at records created in the
  same push. Links are written on both records.
- If one action fails, independent actions still run, dependent ones are reported as blocked,
  and the result of every action is shown.
- Workflow rules see the push as a whole, after all its actions have run.

## Acceptance criteria

| ID     | Criterion                                                                                                                                                                            | Status                                                                               | Verified by                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| AC-3.1 | **Given** a scenario that touches several systems, **when** it is processed, **then** one change set lists every create, update, link and attach it needs.                           | Met                                                                                  | `tests/agent.test.ts` "demo engine produces the expected change sets"; eval _Action precision / recall_                    |
| AC-3.2 | **Given** an approved change set, **when** Maria taps Push once, **then** all approved actions are written to their systems.                                                         | Met                                                                                  | `e2e/agent.spec.ts` "process the demo day… push, see linked records"; eval _Push success_                                  |
| AC-3.3 | **Given** a link between a new and an existing record in different systems, **when** it is pushed, **then** both records show the link.                                              | Met                                                                                  | `tests/gateway.test.ts` "links across servers by writing each side on its own server"; `tests/agent.test.ts` "S1–S6 push…" |
| AC-3.4 | **Given** actions that depend on records created in the same push, **when** it runs, **then** they execute after their dependencies and reference the new ids.                       | Met                                                                                  | `tests/gateway.test.ts` "executes in dependency order, resolving references to new records"                                |
| AC-3.5 | **Given** a push is repeated (retry or double tap), **when** it runs again, **then** no record, link or event is duplicated.                                                         | Met                                                                                  | `tests/gateway.test.ts` "is safe to re-run: idempotency keys prevent duplicates and duplicate events"                      |
| AC-3.6 | **Given** one action fails, **when** the push completes, **then** independent actions are written, dependents are marked blocked with the reason, and each action's result is shown. | Met                                                                                  | `tests/gateway.test.ts` "continues independent actions after a failure, fails dependents, and retries cleanly"             |
| AC-3.7 | **Given** failed actions after a push, **when** Maria fixes the cause, **then** she can retry just those actions from the app.                                                       | Not yet — the gateway supports retry; the Review and Results screens do not offer it | —                                                                                                                          |
| AC-3.8 | **Given** a push, **when** it completes, **then** Results shows each record written and a graph of the links across systems, each opening in the EHS console.                        | Met                                                                                  | `e2e/agent.spec.ts` "process the demo day…"                                                                                |

## Success measures

- **Time from event to complete record** (median under 10 minutes, same shift).
- Eval proxies: _Routing accuracy_, _Action precision / recall_, _Push success_.

## Out of scope

- Editing records directly in the connected systems (the console is read-only in v1).
