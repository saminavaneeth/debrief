# Debrief — Eval criteria

The eval suite checks that the agent pipeline turns captures into the right change set and that
the change set pushes cleanly. It runs the real pipeline: routing, matching, drafting, gap
finding, planning, MCP calls, the gateway and workflows. Only perception (transcripts, image
findings, document text) comes from fixtures, so the evals measure reasoning, not speech or
vision quality.

Run it with `npm run eval`, or **Run evals** on Platform → Evals.

## Eval set

Six scenarios from the demo day ([PRD §5](PRD.md#5-user-journeys)), each in its original
wording and two paraphrased variants (same facts, different words), for **18 cases**.

| Scenario | Situation                            | Systems touched               | Matched actions | Field checks | Gap questions | Citations | Sort suggestions | Duplicate guards | Workflow expectations                                            |
| -------- | ------------------------------------ | ----------------------------- | --------------- | ------------ | ------------- | --------- | ---------------- | ---------------- | ---------------------------------------------------------------- |
| S1       | Forklift near miss, Dock 3           | incidents, hazards            | 5               | 10           | 1             | 1         | 0                | 1                | repeat-area rule fires; high-severity rule does not              |
| S2       | Slip in break room, first aid        | incidents, hazards            | 5               | 14           | 0             | 2         | 0                | 0                | high-severity rule does not fire                                 |
| S3       | Heat-stress toolbox talk             | meetings                      | 3               | 15           | 1             | 0         | 0                | 1                | —                                                                |
| S4       | Extinguisher inspection, 2 failures  | inspections, hazards          | 8               | 21           | 0             | 2         | 0                | 1                | failed-item rule creates nothing; repeat-area rule does not fire |
| S5       | Contractor at height without tie-off | hazards (observation), audits | 5               | 7            | 0             | 1         | 0                | 1                | —                                                                |
| S6       | Leaking valve, two captures          | hazards                       | 2               | 7            | 0             | 1         | 1                | 1                | repeat-area rule does not fire                                   |

Counts are per case; each variant is checked against the same expectations. Inputs live in
`fixtures/scenarios/` (captures, perception fixtures, variants) and expectations in
`fixtures/expected/`.

## What one case does

1. Start a fresh in-memory runtime from the seed data (Training disconnected).
2. Process the scenario's captures (original wording or a variant) into a change set.
3. Compare the change set with the expected change set (below).
4. Approve every action and push it through the gateway.
5. Check which workflow rules fired for that push.

A case **passes** when the comparison has no differences, every expected workflow outcome holds,
and every pushed action executes.

## The expected change set

Each `fixtures/expected/S*.json` file states what a correct result contains:

| Part                        | Meaning                                  | How it is matched                                                                                                                 |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `actions` (create / update) | Records to create or update              | Creates match by server and record type, choosing the candidate with the most matching fields; updates match by target record id. |
| `fields`                    | Exact field values                       | Equal after normalising: strings trimmed and lower-cased, lists compared regardless of order.                                     |
| `fieldsContain`             | Text a field must contain                | Case-insensitive substring.                                                                                                       |
| `includes`                  | An entry a list field must contain       | Some entry matches all given keys (string values by substring).                                                                   |
| `actions` (link / attach)   | Links and attachments                    | Same link type and both ends (existing id, or the matched new record); attachments by artifact and target.                        |
| `gaps`                      | Questions that must be asked             | Same action and field path.                                                                                                       |
| `citations`                 | Knowledge documents a field must cite    | The field (or a child of it) has supporting evidence citing that document.                                                        |
| `sortSuggestions`           | Inbox moves/merges to suggest            | Same kind, captures and target scenario.                                                                                          |
| `forbidden`                 | Duplicates that must not happen          | At most `maxCreates` creates of that record type.                                                                                 |
| `workflows`                 | Rules that must or must not fire on push | Checked after the push for that change set.                                                                                       |

Anything produced that matches no expected action counts as an extra action.

## Metrics

Each metric sums over all 18 cases. Ratios show _matched ÷ total_.

| Metric                    | Definition                                                                 | Target | Latest         |
| ------------------------- | -------------------------------------------------------------------------- | ------ | -------------- |
| Routing accuracy          | Cases whose set of touched server/record types equals the expected set     | 100%   | 100% (18/18)   |
| Action precision          | Matched actions ÷ actions produced                                         | 100%   | 100% (84/84)   |
| Action recall             | Matched actions ÷ actions expected                                         | 100%   | 100% (84/84)   |
| Field accuracy            | Field checks passed (`fields`, `fieldsContain`, `includes`) ÷ field checks | 100%   | 100% (222/222) |
| Unsupported fields        | Drafted values with no evidence, rule, user answer or schema default       | 0      | 0              |
| Gap question precision    | Expected questions asked ÷ all questions asked                             | 100%   | 100% (6/6)     |
| Gap question recall       | Expected questions asked ÷ expected questions                              | 100%   | 100% (6/6)     |
| Citation recall           | Expected citations present ÷ expected citations                            | 100%   | 100% (21/21)   |
| Sort suggestion precision | Expected sort suggestions made ÷ suggestions made                          | 100%   | 100% (3/3)     |
| Sort suggestion recall    | Expected sort suggestions made ÷ expected                                  | 100%   | 100% (3/3)     |
| Duplicate records         | `forbidden` limits exceeded                                                | 0      | 0              |
| Workflow outcomes         | Workflow expectations met ÷ expectations                                   | 100%   | 100% (18/18)   |
| Push success              | Pushed actions executed ÷ actions pushed                                   | 100%   | 100% (84/84)   |

_Latest_ is the run of 2026-11-07 with the demo engine: 18 of 18 cases pass. For the demo engine
the targets are a regression gate: any drop is a bug. Targets for a live model provider will be
set when it is added; _Unsupported fields_ and _Duplicate records_ stay at 0 for any provider.

## How the metrics relate to the product

| Eval metric                               | Product success measure ([PRD §7](PRD.md#7-success-metrics)) | Job ([docs/jtbd](jtbd/README.md)) |
| ----------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Routing accuracy, action precision/recall | Time from event to complete record                           | JTBD-3, JTBD-7                    |
| Field accuracy                            | AI-drafted fields accepted without edit                      | JTBD-1, JTBD-4                    |
| Unsupported fields                        | Unsupported-field rate (0)                                   | JTBD-4                            |
| Gap question precision/recall             | Follow-up questions per record                               | JTBD-4                            |
| Citation recall                           | — (classification quality)                                   | JTBD-5                            |
| Sort suggestions, duplicate records       | Duplicate record rate                                        | JTBD-2                            |
| Workflow outcomes                         | — (follow-up quality)                                        | JTBD-6                            |
| Push success                              | Time from event to complete record                           | JTBD-3                            |

## Output

- The console prints each case (✓ or the differences) and the metrics table.
- `evals/results/<timestamp>.json` and `evals/results/latest.json` hold the full report: every
  case with its comparison, workflow checks, push counts and duration. Results are not committed.
- Platform → Evals shows the latest report and can run the suite again.

## Limits

- **Variants are not a held-out set.** They were written alongside the rules, so they show
  robustness to wording, not performance on unseen input.
- **Perception is not evaluated.** Transcripts, image findings and document text come from
  fixtures. On-device OCR, PDF text and keyframes are covered by end-to-end tests instead.
- **Training is disconnected** during evals; the plug-in behaviour is covered by unit and
  end-to-end tests.
- Six scenarios cover one site's demo day; breadth across sites, languages and record types is
  limited.

## Adding a case

1. Add the scenario to `fixtures/scenarios/` (captures, perception fixtures, two variants).
2. Add `fixtures/expected/<id>.json` with the actions, fields, gaps, citations, sort
   suggestions, duplicate guards and workflow expectations.
3. `npm test` validates both files against their schemas; `npm run eval` scores the new case.
