# JTBD-5 · Regulatory references

> When a classification has regulatory weight (recordability, fall-protection thresholds), I want
> the reference shown next to the decision.

**Personas:** field safety specialist (Maria), who drafts the record; site EHS manager (Dev),
who owns the decision. **Journeys:** J2 (first-aid slip), J5 (contractor at height).

## Situation

Recordability, fall-protection thresholds and similar calls are made in the moment, without the
regulation in front of anyone. A first-aid case logged as recordable, or a fall-protection
breach logged as minor, is a compliance problem found months later.

**Motivation:** make the call correctly and be able to defend it. **Expected outcome:** each
regulated classification shows the rule it relies on, and the reviewer can see and change it
before anything is written.

## How Debrief does the job

- A knowledge index of SOP and regulation summaries (29 CFR 1904.7, 1910.157, 1910.178,
  1926.501, 1910.28) is searched while drafting.
- Classifications with regulatory weight carry a **citation**: the section and the paragraph
  that supports the decision (e.g. cold therapy is on the 1904.7 first-aid list, so the slip is
  not recordable).
- Corrective actions cite the SOP guidance line they come from (owner, due days).
- In review, tapping the field opens the evidence drawer with the citation next to the capture
  evidence.

## Acceptance criteria

| ID     | Criterion                                                                                                                                                                              | Status                                                                                                                                                   | Verified by                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AC-5.1 | **Given** an injury treated only with first aid, **when** it is drafted, **then** it is classified not recordable and cites 29 CFR 1904.7 with the first-aid item that applies.        | Met                                                                                                                                                      | `e2e/agent.spec.ts` "process the demo day, review with evidence…" (1904.7, "Hot or cold therapy")      |
| AC-5.2 | **Given** a worker at height without fall protection on a construction-type task, **when** the audit finding is drafted, **then** it is high severity and cites 29 CFR 1926.501(b)(1). | Met                                                                                                                                                      | `tests/agent.test.ts` "demo engine produces the expected change sets" (S5); eval _Citation recall_     |
| AC-5.3 | **Given** a cited field in review, **when** Maria taps it, **then** the evidence drawer shows the cited document title and passage alongside the capture evidence.                     | Met                                                                                                                                                      | `e2e/agent.spec.ts` "process the demo day, review with evidence…"                                      |
| AC-5.4 | **Given** a corrective action proposed from an SOP, **when** it is shown, **then** it cites the SOP guidance it came from, with owner and due date.                                    | Met                                                                                                                                                      | `tests/agent.test.ts` "demo engine produces the expected change sets" (S2, S6); eval _Citation recall_ |
| AC-5.5 | **Given** every eval scenario, **when** it is processed, **then** every expected citation is present.                                                                                  | Met                                                                                                                                                      | eval _Citation recall_                                                                                 |
| AC-5.6 | **Given** a regulated classification in review, **when** the reviewer disagrees, **then** they can change it before pushing.                                                           | Partly met — the reviewer can reject the action; boolean and choice fields such as _recordable_ cannot be edited inline (only free text and numbers can) | —                                                                                                      |
| AC-5.7 | **Given** a classification is pushed, **when** the record is opened later, **then** the citation is stored with the record's evidence.                                                 | Not verified                                                                                                                                             | —                                                                                                      |

## Success measures

- **AI-drafted fields accepted without edit** at least 85%, for classified fields in particular.
- Eval proxy: _Citation recall_.

## Risks and out of scope

- Regulatory misclassification. Mitigated by citing the reference and keeping the decision a
  reviewable field, not an automatic write.
- Regulation text is paraphrased, not quoted. Regulatory submission (e.g. electronic OSHA 300A
  filing) is out of scope for v1.
