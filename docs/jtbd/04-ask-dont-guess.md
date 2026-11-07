# JTBD-4 · Ask, don't guess

> When a required detail is missing, I want to be asked a specific question instead of having a
> field guessed.

**Persona:** field safety specialist (Maria). **Journeys:** J1 (who was operating FL-07?), J3
(an unreadable name on the sign-in sheet), J7 (who should take the training?).

## Situation

Records are filed with required fields skipped or guessed, because the form demands a value and
the person entering it was not there. A guessed operator or attendee is worse than a blank one:
it looks authoritative and is wrong.

**Motivation:** trust what is written in her name. **Expected outcome:** every value in a record
comes from something she captured or confirmed, and the gaps are closed with one specific
question each.

## How Debrief does the job

- Every drafted field carries **provenance**: the evidence it came from (transcript span, image
  region, document field) or a schema default. A value with neither is not drafted.
- Required values with no evidence become **gap questions**, worded for the situation ("Who was
  operating FL-07?", "Who is T. Nguyen?") with a person or choice picker where possible.
- Required means the target system's schema requires it, or a business rule makes it required
  for this case (e.g. the operator for a near miss involving equipment).
- Questions the target system cannot accept a record without are **blocking**: Push waits until
  they are answered or the action is rejected.
- Answers are written into the record in the shape the system expects (one entry in a list,
  one item in a table).

## Acceptance criteria

| ID     | Criterion                                                                                                                                                                                  | Status | Verified by                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| AC-4.1 | **Given** any processed scenario, **when** the change set is drafted, **then** every field value has supporting evidence or is a schema default.                                           | Met    | eval _Unsupported fields_ = 0                                                                                       |
| AC-4.2 | **Given** a field shown in review, **when** Maria taps it, **then** she sees the evidence behind it (highlighted transcript span, image region or document excerpt).                       | Met    | `e2e/agent.spec.ts` "process the demo day, review with evidence…"                                                   |
| AC-4.3 | **Given** a required value with no evidence, **when** the change set is drafted, **then** a specific question is asked for it, and no question is asked for values the evidence supports.  | Met    | eval _Gap question precision / recall_; `tests/agent.test.ts` "demo engine produces the expected change sets"       |
| AC-4.4 | **Given** a name on a paper form that matches nobody on the roster, **when** it is processed, **then** Maria is asked who that person is, and her answer fills that entry only.            | Met    | `tests/agent.test.ts` "an unmatched sign-in name is resolved in place…"                                             |
| AC-4.5 | **Given** an approved action with an unanswered question its target system requires, **when** Maria tries to push, **then** Push is disabled and the question is named, with a link to it. | Met    | `e2e/platform.spec.ts` "plug in training…"; `tests/agent.test.ts` "flags schema-required gaps…"                     |
| AC-4.6 | **Given** Maria answers a question, **when** the change set is pushed, **then** the answer is stored in the record in the expected shape and the action succeeds.                          | Met    | `tests/agent.test.ts` "flags schema-required gaps…"; `e2e/platform.spec.ts` "plug in training…" (every action done) |
| AC-4.7 | **Given** a value that is required only by a business rule, **when** it is unanswered, **then** the record can still be pushed and the question remains visible.                           | Met    | `tests/agent.test.ts` "flags schema-required gaps…" (operator is not blocking)                                      |
| AC-4.8 | **Given** a validation failure at push, **when** it is reported, **then** the message names the failing fields.                                                                            | Met    | `tests/agent.test.ts` "flags schema-required gaps…"                                                                 |

## Success measures

- **Follow-up questions per record** at most 1.0, and only for truly missing required fields.
- **Unsupported-field rate** = 0. **AI-drafted fields accepted without edit** at least 85%.

## Open questions

- Who answers gap questions when the capturer is not the reviewer?
- How should conflicting evidence within one scenario be presented (two different times spoken)?
