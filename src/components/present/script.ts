/** The 3-minute walkthrough shown in the presenter view (mirrors docs/DEMO_SCRIPT.md). */
export interface DemoStep {
  id: string;
  at: string;
  title: string;
  /** Where the phone goes when the step is opened. */
  phone?: string;
  /** What the right-hand pane shows when the step is opened. */
  side?: string;
  /** A setup action the presenter can run from the step. */
  action?: "loadDemoDay";
  points: string[];
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "day",
    at: "0:00",
    title: "A day in the field",
    phone: "/",
    side: "/console?server=hazards",
    action: "loadDemoDay",
    points: [
      "Maria Chen, EHS specialist, captured six situations today by voice, photo, video, PDF and notes.",
      "One note went to the Inbox without a scenario.",
      "Right: the hazards system as it is now. HAZ-0007, the cracked FL-07 mirror, is open.",
    ],
  },
  {
    id: "scenario",
    at: "0:25",
    title: "One scenario, several captures",
    phone: "/scenario?id=SCN-S1",
    points: [
      "Forklift near miss at Dock 3: a voice note and a photo of the cracked mirror.",
      "Captures stay on the phone, offline, until Maria asks the agent to process them.",
    ],
  },
  {
    id: "plug-in",
    at: "0:45",
    title: "Plug in a system",
    side: "/platform?tab=systems",
    points: [
      "Connect Training. The gateway discovers its tools and manifest.",
      "No code change: the router reads routing hints from the manifest on the next run.",
    ],
  },
  {
    id: "process",
    at: "1:00",
    title: "Process the day",
    phone: "/process",
    side: "/console?server=incidents",
    points: [
      "Process all six scenarios and watch the run trace: ingest, route, match, draft, gaps, plan.",
      "Every read and write goes through MCP tools on the mock systems.",
    ],
  },
  {
    id: "review",
    at: "1:20",
    title: "Review the change set",
    points: [
      "Forklift: create a near-miss incident, update HAZ-0007 instead of duplicating it, link both, and a training assignment from the newly connected system.",
      "Tap a field to see its evidence: the highlighted sentence or the photo region.",
      "Slip: not recordable, citing the 29 CFR 1904.7 first-aid list.",
      "The Inbox V-22 note is suggested into “Tank farm leak”, so one hazard is created, not two.",
      "Answer “Who was operating FL-07?” and “Who should take this training?”, approve all, push.",
      "Push waits for values the target systems require, so nothing fails on the way in.",
    ],
  },
  {
    id: "results",
    at: "2:10",
    title: "Linked records, live",
    side: "/console?server=incidents",
    points: [
      "Results: what was written and the link graph across systems.",
      "The console updates as records arrive. Tap a record in Results to open it here.",
    ],
  },
  {
    id: "platform",
    at: "2:35",
    title: "Workflows and trust",
    side: "/platform?tab=activity",
    points: [
      "Rules fired on the push: a third Dock 3 hazard suggests an audit.",
      "The failed-inspection rule saw the hazards the agent already linked, so no duplicates.",
      "Audit log: every call by the agent and by workflows. Evals: every scenario and variant scored.",
    ],
  },
];
