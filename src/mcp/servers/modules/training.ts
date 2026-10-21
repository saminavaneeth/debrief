import type { ModuleDefinition } from "../core/module";

export const trainingModule: ModuleDefinition = {
  manifest: {
    server: "training",
    displayName: "Training",
    description:
      "Training assignments for employees, including refresher training after incidents.",
    version: "1.0.0",
    recordTypes: [
      {
        recordType: "training_assignment",
        displayName: "Training assignment",
        idPrefix: "TRN",
        description: "A course assigned to one or more people with a due date and reason.",
        routing: {
          keywords: [
            "near miss",
            "operator",
            "refresher",
            "retrain",
            "training",
            "didn't see",
            "couldn't see",
            "unsafe driving",
            "re-evaluate",
            "not trained",
          ],
          exampleSituations: [
            "Forklift operator involved in a near miss needs refresher training",
            "Crew needs heat stress training after a heat-related event",
          ],
          useWhen:
            "An incident or observation shows a person needs training or re-evaluation (e.g. forklift operators after a near miss).",
          categories: ["powered_industrial_trucks", "heat_stress", "falls_from_height"],
        },
        matching: {
          strategy: "condition",
          openStatuses: ["assigned", "overdue"],
          signals: ["assigneeIds", "course"],
        },
        childCollections: [],
      },
    ],
    linkTypes: ["relatedTo", "resultedIn", "causedBy"],
  },
  initialStatus: { training_assignment: "assigned" },
  picklists: {
    course: [
      {
        value: "Forklift operator refresher (29 CFR 1910.178(l))",
        label: "Forklift operator refresher",
      },
      { value: "Heat stress awareness", label: "Heat stress awareness" },
      { value: "Fall protection: authorized user", label: "Fall protection user" },
    ],
  },
};
