import type { ModuleDefinition } from "../core/module";

export const inspectionsModule: ModuleDefinition = {
  manifest: {
    server: "inspections",
    displayName: "Checklists & Inspections",
    description:
      "Scheduled checklist inspections with per-item responses (extinguishers, forklifts, housekeeping).",
    version: "1.0.0",
    recordTypes: [
      {
        recordType: "inspection",
        displayName: "Inspection",
        idPrefix: "INS",
        description:
          "A checklist inspection scheduled for a date; completing it records each item's pass/fail response.",
        routing: {
          keywords: [
            "inspection",
            "checklist",
            "monthly",
            "inspected",
            "pass",
            "fail",
            "gauge",
            "tag",
            "units",
            "extinguisher",
            "pre-shift",
            "walkthrough",
          ],
          exampleSituations: [
            "Completed monthly extinguisher checklist with two failed units",
            "Forklift pre-shift checklist",
          ],
          useWhen:
            "A checklist form was completed, usually against an inspection already scheduled for today.",
          categories: ["fire_protection"],
        },
        matching: {
          strategy: "scheduled",
          openStatuses: ["scheduled", "in_progress", "overdue"],
          signals: ["scheduledDate", "items.assetId", "siteId", "templateId"],
        },
        childCollections: ["items", "correctiveActions"],
      },
    ],
    linkTypes: ["relatedTo", "resultedIn", "foundDuring"],
  },
  initialStatus: { inspection: "scheduled" },
  picklists: {
    itemResponse: [
      { value: "pass", label: "Pass" },
      { value: "fail", label: "Fail" },
      { value: "na", label: "N/A" },
    ],
  },
};
