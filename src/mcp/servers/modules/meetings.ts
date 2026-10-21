import type { ModuleDefinition } from "../core/module";

export const meetingsModule: ModuleDefinition = {
  manifest: {
    server: "meetings",
    displayName: "Safety Meetings",
    description:
      "Toolbox talks, safety committee meetings and shift briefings with attendance and action items.",
    version: "1.0.0",
    recordTypes: [
      {
        recordType: "safety_meeting",
        displayName: "Safety meeting",
        idPrefix: "MTG",
        description:
          "A held meeting: topic, facilitator, attendees from the sign-in sheet, duration and action items.",
        routing: {
          keywords: [
            "toolbox talk",
            "talk",
            "safety meeting",
            "briefing",
            "huddle",
            "sign-in",
            "sign in sheet",
            "attendees",
            "crew",
            "topic",
            "went over",
            "covered",
            "action item",
            "follow-up",
            "minutes",
          ],
          exampleSituations: [
            "Heat stress toolbox talk with the Line B crew, sign-in sheet photo",
            "Monthly safety committee with action items",
          ],
          useWhen: "A group was briefed or trained on a topic and attendance should be recorded.",
          categories: [],
        },
        matching: {
          strategy: "event",
          openStatuses: ["scheduled", "completed"],
          signals: ["areaId", "heldAt", "topic"],
          windowHours: 3,
        },
        childCollections: ["attendees", "actionItems"],
      },
    ],
    linkTypes: ["relatedTo", "resultedIn"],
  },
  initialStatus: { safety_meeting: "completed" },
  picklists: {
    meetingType: [
      { value: "toolbox_talk", label: "Toolbox talk" },
      { value: "safety_committee", label: "Safety committee" },
      { value: "shift_briefing", label: "Shift briefing" },
      { value: "stand_down", label: "Safety stand-down" },
    ],
  },
};
