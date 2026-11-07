# JTBD-1 · Capture in the field

> When something happens on the floor, I want to record it the way I'd tell a colleague, so I can
> stay on the floor and still have a complete record.

**Persona:** field safety specialist (Maria). **Journeys:** J1–J6.

## Situation

Maria is mid-walk: phone in hand, often gloved, in a loud area with weak signal. Something
happens — a near miss, a puddle, a checklist with failures. She has seconds, not minutes. Today
she notes a few words and re-types everything at the end of the shift, from memory, into several
systems. Times, names and asset tags are lost or approximated.

**Motivation:** stay on the floor. **Expected outcome:** nothing she saw is lost, and the record
can be completed later without her recalling it.

## How Debrief does the job

- One **Capture** screen for all five modalities: hold-to-talk voice (tap to lock) with a live
  transcript, photo, video, document and note.
- Captures go to the active scenario or the **Inbox**; a new scenario is one tap. Captures can be
  added to a scenario at any time and moved, split or merged later.
- Each capture keeps its time and can carry an area, an asset tag, hazard quick tags and an
  editable transcript or caption.
- Everything is stored on the device first (IndexedDB). Capture never needs a connection;
  processing waits until there is one.
- The user's own photos, paper forms and PDFs are read on the device (OCR, PDF text, video
  keyframes) so they become evidence like any other capture.

## Acceptance criteria

| ID      | Criterion                                                                                                                                                                           | Status                                                                                                                          | Verified by                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| AC-1.1  | **Given** the Capture screen, **when** Maria records a voice note, takes a photo or video, adds a document or types a note, **then** each is saved as a capture with its timestamp. | Met                                                                                                                             | `e2e/capture.spec.ts` "all five capture types save to the device and survive a reload"                         |
| AC-1.2  | **Given** a saved capture, **when** the app is reloaded or closed, **then** the capture, its media and its details are still there.                                                 | Met                                                                                                                             | `e2e/capture.spec.ts` "all five capture types save…"                                                           |
| AC-1.3  | **Given** no network connection after the first visit, **when** Maria opens the app and captures, **then** the app loads and the captures are saved.                                | Met                                                                                                                             | `e2e/capture.spec.ts` "works offline after the first visit"                                                    |
| AC-1.4  | **Given** a voice capture, **when** Maria speaks, **then** a transcript appears live and she can edit it afterwards.                                                                | Partly met — live transcription needs a connection in Chromium browsers; offline she types the transcript and the audio is kept | `e2e/capture.spec.ts` "all five capture types save…" (edits the transcript)                                    |
| AC-1.5  | **Given** an active scenario, **when** Maria captures, **then** the capture joins that scenario; with no active scenario it goes to the Inbox.                                      | Met                                                                                                                             | `e2e/capture.spec.ts` "group captures: new scenario from Inbox, rename, split, merge, move"                    |
| AC-1.6  | **Given** captures in the Inbox or a scenario, **when** Maria groups them, **then** she can start a scenario from them, move, split, merge and rename.                              | Met                                                                                                                             | `e2e/capture.spec.ts` "group captures…"                                                                        |
| AC-1.7  | **Given** a capture, **when** Maria adds details, **then** she can set an asset tag and a caption, and they are kept.                                                               | Met                                                                                                                             | `e2e/capture.spec.ts` "all five capture types save…"                                                           |
| AC-1.8  | **Given** a capture, **when** Maria adds details, **then** she can set the area and hazard quick tags from the taxonomy.                                                            | Not verified                                                                                                                    | —                                                                                                              |
| AC-1.9  | **Given** the field screens, **when** used outdoors or with gloves, **then** they meet WCAG 2.1 AA and primary touch targets are at least 48 px.                                    | Partly met — WCAG 2.1 AA is checked automatically; target size is a design rule without an automated check                      | `e2e/a11y.spec.ts` "main screens have no WCAG 2.1 AA violations"                                               |
| AC-1.10 | **Given** a photo of a label or a PDF form, **when** it is processed, **then** the visible text becomes evidence without a connection to a cloud service.                           | Met                                                                                                                             | `e2e/agent.spec.ts` "own capture: OCR reads an asset tag…", "own capture: a PDF checklist read on the device…" |

## Success measures

- **Time from event to complete record:** median under 10 minutes when processed the same shift
  (PRD §7). Not instrumented yet.
- **Weekly active field users:** distinct users who process at least one scenario a week.

## Out of scope and open questions

- Native mobile apps (v1 is a PWA). Multi-language capture is _Later_.
- What retention rules apply to raw audio and video once records are pushed?
