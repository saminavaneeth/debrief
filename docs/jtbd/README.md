# Jobs to be done

The jobs Debrief is hired for, from [PRD §4](../PRD.md#4-jobs-to-be-done). Each document states
the job, the situation it comes from, how Debrief does it, and acceptance criteria that define
"done".

| #   | Job                                                                         | Persona                      | Document                                                |
| --- | --------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| 1   | Record what happened the way I'd tell a colleague, and stay on the floor    | Field safety specialist      | [Capture in the field](01-capture-in-the-field.md)      |
| 2   | Add new evidence of a known problem to the existing record, not a duplicate | Field safety specialist      | [Update known problems](02-update-known-problems.md)    |
| 3   | Create and link every record one event needs, in one step                   | Field safety specialist      | [One event, many systems](03-one-event-many-systems.md) |
| 4   | Be asked a specific question when a required detail is missing              | Field safety specialist      | [Ask, don't guess](04-ask-dont-guess.md)                |
| 5   | See the regulatory reference next to decisions that carry regulatory weight | Specialist, site EHS manager | [Regulatory references](05-regulatory-references.md)    |
| 6   | Get the follow-up suggested when patterns emerge                            | Site EHS manager             | [Follow up on patterns](06-follow-up-on-patterns.md)    |
| 7   | Have a new EHS module used without custom integration work                  | EHS administrator            | [Plug in a module](07-plug-in-a-module.md)              |

## Reading the acceptance criteria

Criteria are numbered `AC-<job>.<n>` and written as **Given / When / Then**. Each has a status:

- **Met** — the product behaves this way, and the test named under _Verified by_ checks it.
- **Partly met** — the behaviour exists with a stated limitation.
- **Not yet** — required for the job, not in the product yet.
- **Not verified** — expected to hold, but no automated test checks it.

_Verified by_ names a test (`tests/…` unit, `e2e/…` end to end) or an eval metric from
`npm run eval`, which runs scenarios S1–S6 and their paraphrased variants.

Journeys J1–J7 and scenarios S1–S6 are described in [PRD §5](../PRD.md#5-user-journeys).
