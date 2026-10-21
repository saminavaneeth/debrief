import type { ModuleDefinition } from "../core/module";

export const incidentsModule: ModuleDefinition = {
  manifest: {
    server: "incidents",
    displayName: "Incident Management",
    description: "Injuries, illnesses, near misses, property damage and environmental releases.",
    version: "1.0.0",
    recordTypes: [
      {
        recordType: "incident",
        displayName: "Incident",
        idPrefix: "INC",
        description:
          "Something that happened once at a specific time: someone hurt, nearly hurt, or something damaged or released.",
        routing: {
          keywords: [
            "near miss",
            "nearly",
            "almost",
            "close call",
            "clipped",
            "struck",
            "hit",
            "slipped",
            "fell",
            "fall",
            "injured",
            "hurt",
            "bruised",
            "cut",
            "first aid",
            "ice pack",
            "clinic",
            "damage",
            "damaged",
            "spill",
            "released",
            "back to work",
          ],
          exampleSituations: [
            "Forklift reversing nearly clipped a pedestrian",
            "Employee slipped and bruised a knee, first aid only",
            "Reach truck mast struck a sprinkler pipe",
            "Two gallons of solvent spilled and were contained",
          ],
          useWhen:
            "A person was hurt or nearly hurt, equipment or property was damaged, or material was released, at a specific moment.",
          categories: [],
        },
        matching: {
          strategy: "event",
          openStatuses: ["reported", "investigating", "actions_open"],
          signals: ["areaId", "assetIds", "occurredAt", "involvedPeople"],
          windowHours: 4,
        },
        childCollections: ["correctiveActions"],
      },
    ],
    linkTypes: ["relatedTo", "causedBy", "resultedIn", "foundDuring"],
  },
  initialStatus: { incident: "reported" },
  picklists: {
    incidentType: [
      { value: "injury", label: "Injury" },
      { value: "illness", label: "Illness" },
      { value: "near_miss", label: "Near miss" },
      { value: "property_damage", label: "Property damage" },
      { value: "environmental", label: "Environmental release" },
    ],
    treatment: [
      { value: "none", label: "None" },
      { value: "first_aid", label: "First aid" },
      { value: "medical_treatment", label: "Medical treatment" },
      { value: "restricted_work", label: "Restricted work" },
      { value: "days_away", label: "Days away" },
    ],
  },
};
