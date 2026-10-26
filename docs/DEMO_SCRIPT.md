# Debrief — 3-minute demo script

A walkthrough of one field day: capture → process → review → push → linked records and
workflows. The same steps appear in the presenter view.

## Setup (before the audience arrives)

1. `npm run dev` and open [http://localhost:3000/present](http://localhost:3000/present) on a
   wide screen (1280 px or more). The phone-sized app is in the middle, the EHS systems on the
   right, and the script on the left.
2. Click **Reset demo** in the presenter header. Every capture on this device and every mock EHS
   system goes back to the seed data.

Clicking a step in the script moves the phone and the right-hand pane to where that step starts.
Record links tapped in the phone open in the right-hand pane.

## Walkthrough

### 0:00 — A day in the field

- Click **Load demo day** in step 1.
- Maria Chen, EHS specialist at Cedar Valley Manufacturing, captured six situations today by
  voice, photo, video, PDF checklist and notes. One note went to the Inbox without a scenario.
- On the right, the hazards system as it is now. `HAZ-0007` (the cracked FL-07 mirror at Dock 3)
  is open.

### 0:25 — One scenario, several captures

- Open **Forklift near-miss, Dock 3**: a voice note and a photo of the cracked mirror.
- Captures stay on the phone, offline, until Maria asks the agent to process them.

### 0:45 — Plug in a system

- On the right, **Platform → Systems**: connect **Training**.
- The gateway discovers the new server's tools and manifest. No code changes: the router reads
  the manifest's routing hints on the next run.

### 1:00 — Process the day

- In the phone, **Process 6 scenarios**.
- The run trace streams each step: ingest, route, match, draft, gaps, plan. Every read and write
  is an MCP tool call on the mock systems.
- Short on time: untick **Show each step as it runs** before processing.

### 1:20 — Review the change set

- **Forklift near miss**: create a near-miss incident; update `HAZ-0007` (note, higher risk,
  status mitigating) instead of creating a duplicate; link them; attach the photo to both; and a
  training assignment from the newly connected Training system.
- Tap **Show details**, then a field such as **Type**. The evidence drawer highlights the
  sentence in the transcript (or the region in the photo) that supports it.
- **Slip in break room**: not recordable. Open **OSHA recordable** to see the 29 CFR 1904.7
  first-aid citation (cold therapy).
- The Inbox V-22 note is suggested into **Tank farm leak**, so the valve leak becomes one hazard,
  not two.
- Answer **Who was operating FL-07?** and **Who should take this training?**, tap **Approve all**,
  then **Push**. Push waits until every value the target systems require has an answer.

### 2:10 — Linked records, live

- **Results** shows each record written and the link graph across systems.
- The console on the right has already updated. Tap the new incident in Results to open it on the
  right, with its link to `HAZ-0007`.

### 2:35 — Workflows and trust

- **Platform → Activity**: a third Dock 3 hazard event in 30 days suggests an audit.
- The failed-inspection rule saw the hazards the agent already linked to `INS-0021`, so it did
  not create duplicates.
- **Audit**: every call by the agent and by workflows, with its change set and latency.
- **Evals**: every scenario and paraphrase variant scored on routing, actions, fields, gaps and
  unsupported fields.

## If something goes wrong

| Symptom                                        | Fix                                                    |
| ---------------------------------------------- | ------------------------------------------------------ |
| The phone shows yesterday's captures           | **Reset demo**, then **Load demo day**                 |
| Training is already connected                  | Reset demo restores the starting server set            |
| Processing says it needs a connection          | The app server is not reachable; restart `npm run dev` |
| The presenter view shows "needs a wide screen" | Widen the window to 1024 px or more                    |
