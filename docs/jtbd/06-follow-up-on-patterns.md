# JTBD-6 · Follow up on patterns

> When patterns emerge across the day or the month, I want the system to suggest the follow-up
> (an audit, a toolbox talk).

**Persona:** site EHS manager (Dev). **Journeys:** J1 (third Dock 3 hazard in 30 days), J4
(failed inspection items), plus the closed-incident and high-severity rules.

## Situation

A third hazard in the same area this month, a serious incident, the same forklift turning up in
an incident and a hazard: each is visible only to someone who reads every record. Signals reach
the manager after they have become incidents.

**Motivation:** act on trends before they become injuries. **Expected outcome:** the right
follow-up is proposed when the pattern appears, to the right person, once.

## How Debrief does the job

- **Workflow rules** (JSON, admin-managed) react to record events: field conditions, counts over
  a window grouped by area, and per-item checks. Their actions — notify, create, update, link,
  suggest — go through the same gateway as the agent, so they are permissioned and audited.
- Starter rules:
  1. High-severity incident → notify the site manager and add an investigation action due in 7
     days.
  2. Failed inspection item → create a linked hazard, unless the item already has one.
  3. Three or more hazards in one area within 30 days → suggest an audit of that area.
  4. Closed incident → suggest a toolbox-talk topic for the next safety meeting.
- Suggestions appear as cards in the activity feed (and the header bell) to accept or dismiss;
  an open suggestion is not repeated.
- The agent **proposes new rules** from patterns over the last 60 days (a hazard category that
  keeps recurring, one asset across several record types). Proposals start disabled; an admin
  enables them.

## Acceptance criteria

| ID      | Criterion                                                                                                                                                                                     | Status                                                            | Verified by                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| AC-6.1  | **Given** an incident with severity 4 or higher is created, **when** it is pushed, **then** site managers are notified and an investigation action due in 7 days is added.                    | Met                                                               | `tests/workflows.test.ts` "rule 1: a severity 4+ incident notifies site managers…"                                                 |
| AC-6.2  | **Given** a failed inspection item, **when** it has no linked hazard, **then** one hazard is created and linked to the item; **when** the agent already linked one, **then** none is created. | Met                                                               | `tests/workflows.test.ts` "rule 2…exactly once", "rule 2 does not duplicate the hazards the agent proposed in S4"                  |
| AC-6.3  | **Given** two hazards in Dock 3 in the last 30 days, **when** a third hazard event is pushed, **then** one suggestion to audit Dock 3 appears, listing the hazards behind it.                 | Met                                                               | `tests/workflows.test.ts` "rule 3…one audit suggestion"; `e2e/platform.spec.ts` "plug in training…"                                |
| AC-6.4  | **Given** an incident is closed, **when** the update is pushed, **then** a toolbox-talk topic is suggested.                                                                                   | Met                                                               | `tests/workflows.test.ts` "rule 4: closing an incident suggests a toolbox talk"                                                    |
| AC-6.5  | **Given** an open suggestion, **when** the same pattern fires again, **then** no second card appears.                                                                                         | Not verified — one card per push is checked; a repeat push is not | `tests/workflows.test.ts` "rule 3…one audit suggestion" (single push)                                                              |
| AC-6.6  | **Given** a suggestion card, **when** the manager accepts or dismisses it, **then** its status is recorded and it leaves the open list.                                                       | Met                                                               | `e2e/platform.spec.ts` "plug in training…" (Accept)                                                                                |
| AC-6.7  | **Given** an accepted suggestion, **when** it is accepted, **then** the follow-up (audit, safety meeting topic) is created in the target system for approval.                                 | Not yet — accepting records the decision only                     | —                                                                                                                                  |
| AC-6.8  | **Given** recurring patterns in recent records, **when** the admin runs _Find patterns_, **then** rules are proposed with their rationale and source records, disabled until enabled.         | Met                                                               | `tests/workflows.test.ts` "proposes rules for a repeated asset and a hazard category…"; `e2e/platform.spec.ts` "plug in training…" |
| AC-6.9  | **Given** a disabled rule, **when** a matching event occurs, **then** it does not run.                                                                                                        | Met                                                               | `tests/workflows.test.ts` "disabled rules do not run"                                                                              |
| AC-6.10 | **Given** a push, **when** rules fire, **then** Results lists the workflows it caused and the audit log records each rule action as a workflow write.                                         | Met                                                               | `e2e/platform.spec.ts` "plug in training…" ("via workflow")                                                                        |

## Success measures

- Suggestions accepted ÷ suggestions shown (not instrumented yet).
- Eval proxy: _Workflow outcomes_ (expected rules fired or not fired per scenario).

## Later

- Cross-module trend dashboards; richer pattern detection for rule proposals.
