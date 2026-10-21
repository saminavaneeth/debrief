import { z } from "zod";
import {
  AreaId,
  AssetId,
  IsoDate,
  IsoDateTime,
  OwnerRef,
  PersonId,
  RiskLevel,
  Severity,
} from "../common";
import { CorrectiveAction, meta, Note, RecordBase } from "./base";

const severity = (description: string, rule: "severity" | "severityFromCategory") =>
  Severity.meta(
    meta({
      description: `${description} 1 minimal, 2 minor, 3 moderate, 4 serious, 5 critical.`,
      "x-picklist": "severity",
      "x-fill": { kind: "rule", rule },
    }),
  );

const category = () =>
  z.string().meta(
    meta({
      description: "Hazard taxonomy category id.",
      "x-picklist": "hazardCategory",
      "x-fill": { kind: "category" },
    }),
  );

const eventTime = (description: string) =>
  IsoDateTime.meta(meta({ description, "x-fill": { kind: "eventTime" } }));

/** Corrective actions drafted from the knowledge documents' guidance for the category. */
const guidedCorrectiveActions = () =>
  z
    .array(CorrectiveAction)
    .default([])
    .meta(
      meta({
        description: "Actions to remove or control the hazard.",
        "x-fill": { kind: "guidance" },
      }),
    );

/* ------------------------------------------------------------------ incidents */

export const IncidentType = z.enum([
  "injury",
  "illness",
  "near_miss",
  "property_damage",
  "environmental",
]);

export const InvolvedPerson = z.strictObject({
  personId: PersonId.optional(),
  name: z.string(),
  role: z.enum(["injured", "operator", "witness", "exposed", "struck_or_nearly_struck"]),
});

export const Treatment = z.enum([
  "none",
  "first_aid",
  "medical_treatment",
  "restricted_work",
  "days_away",
]);

export const Incident = RecordBase.extend({
  server: z.literal("incidents"),
  recordType: z.literal("incident"),
  status: z.enum(["reported", "investigating", "actions_open", "closed"]),
  incidentType: IncidentType.meta(
    meta({
      description: "Kind of incident.",
      "x-picklist": "incidentType",
      "x-fill": {
        kind: "enumKeywords",
        negation: true,
        map: {
          near_miss: [
            "near miss",
            "nearly",
            "almost",
            "close call",
            "came within",
            "no contact",
            "didn't touch",
            "narrowly",
          ],
          injury: [
            "slipped",
            "slip",
            "fell",
            "fall",
            "bruised",
            "bruise",
            "cut",
            "hurt",
            "injured",
            "injury",
            "first aid",
            "ice pack",
            "cold pack",
            "went down",
            "strained",
            "sprained",
          ],
          illness: ["dizzy", "heat exhaustion", "nausea", "illness", "fainted"],
          property_damage: ["struck the", "damaged", "dented", "bent", "contacted"],
          environmental: ["spilled", "released", "spill reached", "into the drain"],
        },
      },
    }),
  ),
  severity: severity("Actual or credible potential severity.", "severity"),
  occurredAt: eventTime("When it happened."),
  involvedPeople: z
    .array(InvolvedPerson)
    .default([])
    .meta(
      meta({
        description: "People involved and how.",
        "x-fill": {
          kind: "people",
          roles: {
            injured: [
              "slipped",
              "fell",
              "bruised",
              "bruise",
              "hurt",
              "injured",
              "went down",
              "fall",
            ],
            struck_or_nearly_struck: [
              "clipped",
              "nearly",
              "almost hit",
              "almost",
              "came within",
              "hit",
              "struck",
            ],
            witness: ["saw", "witnessed", "witness"],
            operator: ["operating", "driving", "driver", "operator"],
          },
        },
      }),
    ),
  equipmentOperatorId: PersonId.optional().meta(
    meta({
      description: "Person operating the equipment involved.",
      "x-requiredWhen": [
        { field: "incidentType", op: "in", value: ["near_miss", "property_damage"] },
        { field: "assetIds", op: "notEmpty" },
      ],
      "x-gapQuestion": "Who was operating {{assetIds}}?",
      "x-fill": { kind: "person", cues: ["operating", "driving", "driver", "operator"] },
    }),
  ),
  injury: z
    .strictObject({
      bodyPart: z.string(),
      nature: z.string(),
      treatment: Treatment,
      returnedToWork: z.boolean(),
    })
    .optional()
    .meta(
      meta({
        description: "Injury details.",
        "x-requiredWhen": [{ field: "incidentType", op: "eq", value: "injury" }],
        "x-gapQuestion": "What was the injury and what treatment was given?",
        "x-fill": { kind: "rule", rule: "injury" },
      }),
    ),
  recordable: z
    .boolean()
    .optional()
    .meta(
      meta({
        description: "OSHA recordable per 29 CFR 1904.7. Must cite the basis.",
        "x-requiredWhen": [{ field: "incidentType", op: "in", value: ["injury", "illness"] }],
        "x-gapQuestion": "Is this case recordable (treatment beyond first aid, days away)?",
        "x-fill": { kind: "rule", rule: "recordability" },
      }),
    ),
  recordabilityBasis: z
    .string()
    .optional()
    .meta(
      meta({
        description: "Why it is or is not recordable.",
        "x-fill": { kind: "rule", rule: "recordabilityBasis" },
      }),
    ),
  immediateActions: z
    .array(z.string())
    .default([])
    .meta(
      meta({
        description: "Actions taken on the spot.",
        "x-fill": {
          kind: "actions",
          cues: [
            "tagged * out",
            "tagged it",
            "tag out",
            "out of service",
            "ice pack",
            "cold pack",
            "cleaned up",
            "roped off",
            "stopped work",
            "barricaded",
            "first aid",
          ],
        },
      }),
    ),
});

/* ------------------------------------------------------------------ hazards & observations */

export const Hazard = RecordBase.extend({
  server: z.literal("hazards"),
  recordType: z.literal("hazard"),
  status: z.enum(["open", "mitigating", "closed"]).meta(
    meta({
      description: "Open until controlled; mitigating while a temporary control is in place.",
      "x-update": {
        kind: "enumKeywords",
        negation: true,
        map: {
          mitigating: [
            "tagged * out",
            "tagged it",
            "out of service",
            "roped off",
            "coned off",
            "barricaded",
            "drip pan",
            "temporary fix",
          ],
          closed: ["fixed", "repaired", "replaced", "removed for good"],
        },
      },
    }),
  ),
  category: category(),
  riskLevel: RiskLevel.meta(
    meta({
      description: "Current risk level.",
      "x-picklist": "riskLevel",
      "x-fill": { kind: "rule", rule: "riskFromCategory" },
      "x-update": { kind: "raiseIfLinked", types: ["incident"] },
    }),
  ),
  identifiedAt: eventTime("When the hazard was identified."),
  source: z.enum(["walkdown", "inspection", "incident", "audit", "employee_report"]).meta(
    meta({
      description: "How the hazard was found.",
      "x-fill": {
        kind: "context",
        map: { inspection: "inspection", incident: "incident", audit: "audit" },
        default: "walkdown",
      },
    }),
  ),
  notes: z
    .array(Note)
    .default([])
    .meta(meta({ description: "Running notes.", "x-update": { kind: "note" } })),
  correctiveActions: guidedCorrectiveActions(),
});

export const Observation = RecordBase.extend({
  server: z.literal("hazards"),
  recordType: z.literal("observation"),
  status: z.enum(["open", "closed"]),
  observationType: z.enum(["unsafe_act", "unsafe_condition", "positive"]).meta(
    meta({
      description: "Behaviour, condition, or positive recognition.",
      "x-fill": {
        kind: "enumKeywords",
        negation: false,
        map: {
          unsafe_act: [
            "not tied off",
            "isn't tied off",
            "no tie off",
            "without a harness",
            "not wearing",
            "walking outside",
            "cut across",
            "no hard hat",
          ],
          unsafe_condition: ["staged near", "left open", "stored in front"],
          positive: ["correctly", "doing it right", "good catch", "well done"],
        },
      },
    }),
  ),
  category: category(),
  severity: severity("Potential severity.", "severityFromCategory"),
  observedAt: eventTime("When it was observed."),
  contractorId: z
    .string()
    .optional()
    .meta(
      meta({
        description: "Contractor company, when a contractor was observed.",
        "x-fill": { kind: "contractor" },
      }),
    ),
  personObserved: z
    .string()
    .optional()
    .meta(meta({ description: "Name or description of the person." })),
  stopWorkInvoked: z
    .boolean()
    .default(false)
    .meta(
      meta({
        description: "Whether the observer stopped the work.",
        "x-fill": {
          kind: "flag",
          cues: [
            "stopped work",
            "stop work",
            "work stopped",
            "called stop work",
            "stopped the job",
          ],
        },
      }),
    ),
  spokeWithId: PersonId.optional().meta(
    meta({
      description: "Person the observer spoke to.",
      "x-fill": {
        kind: "person",
        cues: ["spoke to", "spoke with", "talked with", "talked to", "discussed with", "foreman"],
      },
    }),
  ),
});

/* ------------------------------------------------------------------ audits */

export const AuditFinding = z.strictObject({
  id: z.string(),
  title: z.string().meta(meta({ description: "Finding headline.", "x-fill": { kind: "title" } })),
  description: z
    .string()
    .meta(meta({ description: "What was observed.", "x-fill": { kind: "statements" } })),
  severity: severity("Finding severity.", "severityFromCategory"),
  requirementRef: z
    .string()
    .optional()
    .meta(meta({ description: "Requirement not met.", "x-fill": { kind: "regulation" } })),
  areaId: AreaId.optional().meta(meta({ description: "Where.", "x-fill": { kind: "area" } })),
  observedAt: eventTime("When it was observed."),
  status: z.enum(["open", "closed"]).default("open"),
  correctiveActions: guidedCorrectiveActions(),
});

export const Audit = RecordBase.extend({
  server: z.literal("audits"),
  recordType: z.literal("audit"),
  status: z.enum(["planned", "in_progress", "completed", "closed"]),
  auditType: z.enum(["contractor_safety", "internal_ehs", "regulatory_readiness", "housekeeping"]),
  contractorId: z.string().optional(),
  scope: z.string(),
  leadAuditorId: PersonId,
  scheduledDate: IsoDate,
  findings: z.array(AuditFinding).default([]),
});

/* ------------------------------------------------------------------ meetings */

export const Attendee = z.strictObject({
  personId: PersonId.optional(),
  /** Name as written on the sign-in sheet. */
  name: z.string(),
});

export const ActionItem = z.strictObject({
  id: z.string(),
  title: z.string(),
  ownerRef: OwnerRef.optional(),
  dueDate: IsoDate.optional(),
  status: z.enum(["open", "done"]),
});

export const SafetyMeeting = RecordBase.extend({
  server: z.literal("meetings"),
  recordType: z.literal("safety_meeting"),
  status: z.enum(["scheduled", "completed"]),
  meetingType: z.enum(["toolbox_talk", "safety_committee", "shift_briefing", "stand_down"]).meta(
    meta({
      description: "Kind of meeting.",
      "x-fill": {
        kind: "enumKeywords",
        negation: true,
        map: {
          toolbox_talk: ["toolbox talk", "toolbox", "talk"],
          safety_committee: ["safety committee", "committee"],
          shift_briefing: ["briefing", "huddle", "shift start"],
          stand_down: ["stand down"],
        },
      },
    }),
  ),
  topic: z.string().meta(
    meta({
      description: "Main topic covered.",
      "x-fill": {
        kind: "documentField",
        field: "topic",
        cues: ["talk on", "talk about", "topic was", "went over"],
      },
    }),
  ),
  heldAt: IsoDateTime.meta(
    meta({
      description: "When the meeting started.",
      "x-fill": { kind: "eventTime", documentFields: { date: "date", time: "time" } },
    }),
  ),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .meta(meta({ description: "Length in minutes.", "x-fill": { kind: "duration" } })),
  facilitatorId: PersonId.meta(
    meta({
      description: "Who ran the meeting.",
      "x-fill": { kind: "person", documentField: "presenter", fallback: "capturer" },
    }),
  ),
  attendees: z
    .array(Attendee)
    .default([])
    .meta(
      meta({
        description: "Attendees, matched to the roster where possible.",
        "x-gapQuestion": "Who is {{name}}? No match in the roster.",
        "x-fill": { kind: "roster" },
      }),
    ),
  actionItems: z
    .array(ActionItem)
    .default([])
    .meta(
      meta({
        description: "Follow-up actions agreed in the meeting.",
        "x-fill": {
          kind: "actionItems",
          cues: ["action item", "follow up", "one action", "to do", "owns it"],
        },
      }),
    ),
});

/* ------------------------------------------------------------------ inspections */

export const InspectionItem = z.strictObject({
  id: z.string(),
  label: z.string(),
  assetId: AssetId.optional(),
  location: z.string().optional(),
  response: z.enum(["pass", "fail", "na"]).nullable(),
  notes: z.string().optional(),
  correctiveActions: z.array(CorrectiveAction).default([]),
});

export const Inspection = RecordBase.extend({
  server: z.literal("inspections"),
  recordType: z.literal("inspection"),
  status: z.enum(["scheduled", "in_progress", "completed", "overdue"]),
  inspectionType: z.string(),
  templateId: z.string(),
  scheduledDate: IsoDate,
  completedAt: IsoDateTime.optional(),
  inspectorId: PersonId,
  result: z.enum(["pending", "pass", "fail"]),
  items: z.array(InspectionItem),
});

/* ------------------------------------------------------------------ training */

export const TrainingAssignment = RecordBase.extend({
  server: z.literal("training"),
  recordType: z.literal("training_assignment"),
  status: z.enum(["assigned", "completed", "overdue"]),
  course: z.string().meta(
    meta({
      description: "Course to complete.",
      "x-picklist": "course",
      "x-fill": {
        kind: "enumKeywords",
        negation: true,
        map: {
          "Forklift operator refresher (29 CFR 1910.178(l))": [
            "forklift",
            "reversing",
            "operator",
            "near miss",
            "nearly",
          ],
          "Heat stress awareness": ["heat stress", "heat exhaustion", "dizzy"],
          "Fall protection: authorized user": ["tied off", "tie off", "harness", "fall protection"],
        },
      },
    }),
  ),
  assigneeIds: z
    .array(PersonId)
    .min(1)
    .meta(
      meta({
        description: "People who must take the course.",
        "x-gapQuestion": "Who should take this training?",
        "x-fill": { kind: "person", cues: ["operating", "driving", "driver", "operator"] },
      }),
    ),
  dueDate: IsoDate.meta(
    meta({
      description: "Complete by.",
      "x-gapQuestion": "When should the training be completed?",
    }),
  ),
  reason: z
    .string()
    .meta(meta({ description: "Why it is assigned.", "x-fill": { kind: "statements" } })),
});

export const EhsRecord = z.discriminatedUnion("recordType", [
  Incident,
  Hazard,
  Observation,
  Audit,
  SafetyMeeting,
  Inspection,
  TrainingAssignment,
]);

export type Incident = z.infer<typeof Incident>;
export type Hazard = z.infer<typeof Hazard>;
export type Observation = z.infer<typeof Observation>;
export type Audit = z.infer<typeof Audit>;
export type SafetyMeeting = z.infer<typeof SafetyMeeting>;
export type Inspection = z.infer<typeof Inspection>;
export type TrainingAssignment = z.infer<typeof TrainingAssignment>;
export type EhsRecord = z.infer<typeof EhsRecord>;

/** Zod schema per record type, used by the mock servers to publish JSON Schema resources. */
export const RECORD_SCHEMAS = {
  incident: Incident,
  hazard: Hazard,
  observation: Observation,
  audit: Audit,
  safety_meeting: SafetyMeeting,
  inspection: Inspection,
  training_assignment: TrainingAssignment,
} as const;
