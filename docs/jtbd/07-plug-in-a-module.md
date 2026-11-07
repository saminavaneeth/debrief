# JTBD-7 · Plug in a module

> As an admin, when we add a new EHS module, I want the agent to start using it without custom
> integration work.

**Persona:** EHS administrator. **Journey:** J7 (enable Training; the next near miss proposes a
training assignment).

## Situation

Each new EHS module usually means an integration project: mapping fields, routing rules and
forms, then maintaining them as the module changes. Until that is done, field data for the new
module is still re-typed by hand.

**Motivation:** connect a module without a project. **Expected outcome:** once connected, the
agent routes relevant events to it, drafts valid records for it, and every write is controlled
and audited like any other system.

## How Debrief does the job

- Each EHS module is an MCP server that publishes its tools, a **manifest** (what it is for,
  routing keywords, example situations, link types) and a **schema** per record type (required
  fields, picklists, drafting hints).
- The orchestrator has no module-specific code: it discovers connected servers at run time and
  routes, matches and drafts from their manifests and schemas.
- The **Platform** screen lists servers and their discovered tools; connecting or disconnecting
  one is a toggle.
- Writes to the new module go through the same gateway: role permissions, autonomy level,
  validation, idempotency and audit.

## Acceptance criteria

| ID     | Criterion                                                                                                                                                                                                                           | Status                                                                               | Verified by                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-7.1 | **Given** a registered but disconnected module, **when** the admin connects it on the Platform screen, **then** it becomes discoverable and callable without a restart or code change.                                              | Met                                                                                  | `tests/gateway.test.ts` "enabling training makes it discoverable and callable without restarting"; `e2e/platform.spec.ts` "plug in training…" |
| AC-7.2 | **Given** a connected module, **when** the admin opens Systems, **then** its discovered tools are listed.                                                                                                                           | Met                                                                                  | `e2e/platform.spec.ts` "plug in training…"                                                                                                    |
| AC-7.3 | **Given** Training is connected, **when** a forklift near miss is processed, **then** the change set proposes a training assignment linked to the incident, with course and due date drafted from the module's manifest and schema. | Met                                                                                  | `tests/agent.test.ts` "enabling the training server makes the next near miss propose a training assignment" (S1 and variants)                 |
| AC-7.4 | **Given** Training is connected, **when** scenarios unrelated to training are processed, **then** nothing is proposed for it.                                                                                                       | Met                                                                                  | `tests/agent.test.ts` "enabling the training server…" (S2–S6)                                                                                 |
| AC-7.5 | **Given** the new module requires a value the captures do not contain (assignee), **when** the change set is drafted, **then** it is asked as a blocking question and the record is accepted once answered.                         | Met                                                                                  | `tests/agent.test.ts` "flags schema-required gaps…"; `e2e/platform.spec.ts` "plug in training…"                                               |
| AC-7.6 | **Given** writes to the new module, **when** they are pushed, **then** they appear in the audit log and follow the same permission and autonomy policy as other modules.                                                            | Met                                                                                  | `e2e/platform.spec.ts` "plug in training…" (`training.create_record` in Audit)                                                                |
| AC-7.7 | **Given** a module is disconnected, **when** the next scenario is processed, **then** nothing is proposed for it.                                                                                                                   | Met                                                                                  | `tests/agent.test.ts` "enabling the training server…" (before enabling)                                                                       |
| AC-7.8 | **Given** a module that is not registered yet, **when** an admin adds it, **then** it is registered by configuration (server entry and transport in `mcp.config.json`) without changes to the agent.                                | Partly met — needs a deployment with the new server; there is no in-app registration | —                                                                                                                                             |

## Success measures

- Modules connected without orchestrator changes (target: all).
- Eval proxy: _Routing accuracy_ stays at its baseline when a module is added.

## Later

- Connectors to commercial EHS platforms in place of the mock servers.
- Admin-authored routing hints and schemas in the UI.
