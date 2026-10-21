# Debrief — Product Requirements

## 1. Problem

Safety professionals spend their day in the field: walking docks and production lines, running
toolbox talks, doing inspections, talking to contractors. What they see is messy and multimodal — a
spoken account of a near miss, a photo of a cracked mirror, a paper sign-in sheet, a checklist with
two failures, a short video of someone working at height.

The systems that need this information are structured and separate. A single near miss may belong in
the incident system, update an open hazard, and attach evidence to both. Today the specialist
re-types the same facts into several applications at the end of the shift, from memory, often hours
later. The result:

- **Lost and late detail.** Times, names, asset tags and conditions are forgotten or approximated.
- **Duplicates.** A new photo of a known problem becomes a new hazard instead of an update to the
  open one.
- **Missing links.** The incident, the hazard that caused it and the inspection that found it are
  not connected, so trends and root causes are hard to see.
- **Unfinished records.** Required fields are skipped or guessed; recordability decisions are made
  without the reference in front of the person.
- **Time away from the floor.** Data entry displaces the field work that prevents injuries.

## 2. Product

Debrief is a mobile-first capture app and an orchestration layer over the customer's existing EHS
applications. The user captures what happened in whatever form is natural, groups captures into
scenarios, and asks Debrief to process them. Debrief proposes a **change set** — the records to
create, the existing records to update, the links between them and the evidence to attach — with
every field traced to the capture it came from. The user reviews, answers any questions, approves,
and Debrief writes to the connected systems and triggers their workflows.

Core loop: **capture → group into scenarios → process → review change set → push → linked records
and triggered workflows.**

## 3. Personas

### Field safety specialist (primary) — "Maria"

EHS specialist at a manufacturing site. Walks the site most of the day, phone in hand, often wearing
gloves, often in loud areas or with weak signal. Owns observations, hazard reports, inspections and
toolbox talks; first responder for incident documentation.

- Needs: capture in seconds; never lose a capture; trust what gets written in her name.
- Frustrations: duplicate entry across systems, end-of-shift backlog, finding the existing record to
  update.

### Site EHS manager — "Dev"

Owns the site's EHS programs, corrective actions and reporting. Reviews what was pushed, assigns
owners, watches trends, decides recordability with the specialist.

- Needs: complete, linked records; escalation on serious events; trend signals before they become
  incidents.
- Frustrations: inconsistent records; links between incidents, hazards and audits that only exist in
  people's heads.

### EHS administrator

Configures connected systems, who may do what, how much the agent may do without approval, and the
workflow rules.

- Needs: connect a new module without a project; control autonomy per action type; see an audit log
  of every write.

## 4. Jobs to be done

1. When something happens on the floor, I want to record it the way I'd tell a colleague, so I can
   stay on the floor and still have a complete record.
2. When I see a problem that is already known, I want my new evidence added to the existing record,
   so we don't end up with duplicates.
3. When one event touches several systems, I want all the records created and linked in one step.
4. When a required detail is missing, I want to be asked a specific question instead of having a
   field guessed.
5. When a classification has regulatory weight (recordability, fall-protection thresholds), I want
   the reference shown next to the decision.
6. When patterns emerge across the day or the month, I want the system to suggest the follow-up
   (an audit, a toolbox talk).
7. As an admin, when we add a new EHS module, I want the agent to start using it without custom
   integration work.

## 5. User journeys

### J1 — Near miss with a known hazard (S1)

Maria hears about a forklift near miss at Dock 3, holds to talk for 30 seconds and takes a photo of
the cracked mirror. Later she taps **Process**. Debrief proposes: create a near-miss incident,
update the existing open mirror hazard (note, raised risk, status mitigating), link them, attach the
photo to both, and asks one question — who was operating FL-07? She answers and approves. The repeat
hazards rule notices this is the third Dock 3 hazard activity in 30 days and suggests an area audit.

### J2 — First-aid injury and its cause (S2)

A slip by the break-room ice machine. Voice, a photo of the puddle and a note. Debrief drafts an
injury incident classified **not recordable**, citing the first-aid list (cold therapy) in 29 CFR
1904.7, and a separate wet-floor hazard for the leaking machine with a repair action for maintenance
due in three days, linked to the incident.

### J3 — Toolbox talk from paper (S3)

Maria photographs the sign-in sheet and records a short voice note. Debrief creates the safety
meeting, matches seven of eight names to the roster, asks who the eighth is, records the action item
with owner and due date, and links the meeting to the open heat-stress hazard.

### J4 — Inspection with failures (S4)

Maria uploads the completed extinguisher checklist PDF and photos of the two failed units. Debrief
completes the scheduled inspection, records item responses, creates two hazards and links each to
its inspection item. The failed-item workflow sees the links and does not create duplicates.

### J5 — Contractor stop-work (S5)

A short video of a contractor at the mezzanine edge without tie-off and a note about stopping work.
Debrief creates an unsafe-act observation and appends a high-severity finding to the open contractor
safety audit, citing 29 CFR 1926.501(b)(1).

### J6 — Same problem, two captures, hours apart (S6)

A morning Inbox note about a dripping valve and an afternoon photo of the oil sheen in the "Tank farm
leak" scenario. Debrief suggests moving the note into the scenario and creates a single hazard with a
spill-response corrective action.

### J7 — Plug in a module

The admin enables the Training server on the Platform screen. The next processed incident includes a
proposed training assignment, because the agent discovered the new module's manifest — no code
change.

## 6. Scope

### v1 (this release)

- PWA capture: voice (live transcript), photo, video, document, note; offline capture; scenarios and
  Inbox; add to a scenario any time.
- Processing pipeline: ingest → route → match → draft → gaps → plan, with a live run trace.
- Review: create / update / link / attach actions, before/after diffs, field-level provenance,
  knowledge citations, inline gap questions, approve all or per action.
- Push through a gateway with policy, validation, idempotency and an audit log.
- Five connected modules (incidents, audits, safety meetings, hazards & observations, inspections)
  plus a Training module that can be enabled at runtime.
- Workflow engine with four starter rules and rule proposals.
- EHS console showing the connected systems' records live; Platform screen for servers, policy,
  rules, audit log, run traces and eval results.
- Deterministic demo engine: perception from fixtures, real reasoning; evals on six scenarios plus
  paraphrased variants.

### Later

- Live model provider for perception and reasoning, behind the same interface.
- Connectors to commercial EHS platforms (replacing mock servers).
- Multi-user review and delegation; manager approval queues.
- Multi-language capture and transcripts.
- Hosted database store; multi-site tenancy; SSO.
- Analytics: trend dashboards across modules.

### Out of scope for v1

- Editing records directly in the connected systems (the console is read-only).
- Native mobile apps.
- Regulatory submission (e.g. electronic OSHA 300A filing).

## 7. Success metrics

| Metric                                  | Definition                                                               | v1 target                                         |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| Time from event to complete record      | Capture timestamp of first artifact → all actions in the scenario pushed | Median < 10 min when processed same shift         |
| AI-drafted fields accepted without edit | Drafted fields approved unchanged ÷ drafted fields shown                 | ≥ 85%                                             |
| Duplicate record rate                   | Records later merged or closed as duplicate ÷ records created            | < 2%                                              |
| Follow-up questions per record          | Gap questions asked ÷ records created or updated                         | ≤ 1.0, and only for truly missing required fields |
| Weekly active field users               | Distinct users who process at least one scenario in a week               | Growth week over week during pilot                |
| Unsupported-field rate                  | Drafted values with no evidence or schema default ÷ drafted values       | 0                                                 |

Eval-time proxies (measured by `npm run eval` on S1–S6 and variants): routing accuracy, action
accuracy, field accuracy, unsupported fields, gap-question precision.

## 8. Roadmap

**Now** — Demo-mode product end to end: capture app, mock EHS systems over MCP, agent pipeline with
provenance, review and push, workflows, Platform screen, evals.

**Next** — Live model provider; real speech and vision perception; first commercial EHS connector;
hosted store; manager review queue; richer pattern detection for rule proposals.

**Later** — Multi-site tenancy and SSO; cross-module analytics; multi-language capture; admin-authored
routing hints and schemas in the UI; mobile device management integration.

## 9. Risks and open questions

**Risks**

- **Wrong record written in the user's name.** Mitigated by human approval, field provenance, gap
  questions instead of guesses, and per-action autonomy policy.
- **Wrong find-and-update target.** A false match corrupts an existing record. Mitigated by
  structured signals (asset, area, status, time window), a match threshold, and showing the match
  score and diff in review.
- **Regulatory misclassification** (e.g. recordability). Mitigated by citing the reference and
  keeping the decision a reviewable field, not an automatic write.
- **Field conditions.** Noise, gloves, glare and poor signal. Mitigated by large touch targets,
  hold-to-talk, editable transcripts, offline capture and deferred processing.
- **Speech recognition needs a connection in Chromium browsers.** Offline fallback is typing; audio
  is always kept.
- **Integration drift.** Connected systems change schemas. Mitigated by reading schemas and manifests
  at runtime and validating before every write.

**Open questions**

- Which autonomy defaults will customers accept (e.g. attach-to-existing as automatic)?
- Should the agent be allowed to close records, or only propose closure?
- How should conflicting evidence within one scenario be presented (two different times spoken)?
- What retention rules apply to raw audio and video once records are pushed?
- Who answers gap questions when the capturer is not the reviewer?
