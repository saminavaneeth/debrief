# JTBD-2 · Update known problems

> When I see a problem that is already known, I want my new evidence added to the existing
> record, so we don't end up with duplicates.

**Persona:** field safety specialist (Maria). **Journeys:** J1 (FL-07 mirror), J4 (scheduled
inspection), J6 (valve leak captured twice).

## Situation

Maria photographs a cracked forklift mirror that was reported last week, or notices the same
valve leak in the morning and again in the afternoon. Finding the existing record means searching
another system by guesswork, so a new hazard gets filed instead. Duplicates split the history,
hide how long a problem has been open and inflate counts.

**Motivation:** keep one record per real-world problem. **Expected outcome:** the existing
record carries the new evidence, and its history shows what changed.

## How Debrief does the job

- Before drafting anything, the agent searches the connected systems for candidate records and
  scores them on structured signals: same asset, same area, open status, time window, text
  similarity. Above the threshold it proposes an **update** (and a link); below it, a **create**.
- Updates show a before/after diff and the match confidence in review, and can be rejected.
- Captures of one problem made hours apart are recognised as one: an Inbox capture that mentions
  the same asset as a scenario is suggested into it, so a single record is created.
- Evidence (photos, documents) is attached to the existing record, not copied into a new one.

## Acceptance criteria

| ID     | Criterion                                                                                                                                                                                             | Status | Verified by                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-2.1 | **Given** an open hazard for asset FL-07 at Dock 3, **when** a new capture describes the same mirror, **then** the change set updates that hazard (note, risk, status) instead of creating a new one. | Met    | `tests/agent.test.ts` "demo engine produces the expected change sets" (S1 and variants)                                                      |
| AC-2.2 | **Given** a photo whose only identifying detail is a printed asset tag, **when** it is processed, **then** the tag is read on the device and the known hazard for that asset is updated.              | Met    | `e2e/agent.spec.ts` "own capture: OCR reads an asset tag from a photo, so a known hazard is updated"                                         |
| AC-2.3 | **Given** a scheduled inspection, **when** its completed checklist is captured, **then** that inspection is completed with item responses rather than a new inspection created.                       | Met    | `tests/agent.test.ts` (S4); `e2e/agent.spec.ts` "own capture: a PDF checklist… completes the scheduled inspection"                           |
| AC-2.4 | **Given** an Inbox note and a later scenario about the same asset, **when** they are processed, **then** Debrief suggests moving the note into the scenario and only one record is created.           | Met    | `e2e/agent.spec.ts` "process the demo day…" (sort suggestion); eval _Sort suggestion precision/recall_                                       |
| AC-2.5 | **Given** any scenario in the eval set, **when** it is processed, **then** no record that the expected change set forbids as a duplicate is created.                                                  | Met    | eval _Duplicate records_ = 0                                                                                                                 |
| AC-2.6 | **Given** a proposed update, **when** Maria reviews it, **then** she sees the target record id, the match confidence and the before/after values, and can reject it.                                  | Met    | `e2e/agent.spec.ts` "process the demo day…" (HAZ-0007, "mitigating")                                                                         |
| AC-2.7 | **Given** an update is pushed, **when** the record is opened in the EHS system, **then** its history shows the change and the attached evidence.                                                      | Met    | `tests/servers.test.ts` "update_record patches, records history with before/after…"; `tests/agent.test.ts` "S1–S6 push through the gateway…" |
| AC-2.8 | **Given** no candidate above the threshold, **when** a capture is processed, **then** a new record is proposed and no existing record is changed.                                                     | Met    | `tests/agent.test.ts` "demo engine produces the expected change sets" (S2, S5)                                                               |

## Success measures

- **Duplicate record rate** under 2% (records later merged or closed as duplicate ÷ created).
- Eval proxies: _Action precision / recall_ (correct create vs update and target ids),
  _Duplicate records_ = 0.

## Risks and open questions

- A false match corrupts an existing record. Mitigated by structured signals, the threshold, and
  showing confidence and diff in review; the update needs approval.
- Should the agent be allowed to close records, or only propose closure?
