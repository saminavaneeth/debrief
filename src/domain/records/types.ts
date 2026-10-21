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
import { CorrectiveAction, meta, RecordBase } from "./base";

const severity = (description: string) =>
  Severity.meta(
    meta({
      description: `${description} 1 minimal, 2 minor, 3 moderate, 4 serious, 5 critical.`,
      "x-picklist": "severity",
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
      "x-extractionHint":
        "near_miss: nearly, almost, close call, no contact. injury: hurt, bruised, cut, slipped and fell.",
      "x-picklist": "incidentType",
    }),
  ),
  severity: severity("Actual or credible potential severity."),
  occurredAt: IsoDateTime.meta(
    meta({
      description: "When it happened.",
      "x-extractionHint": "Spoken time, else capture time.",
    }),
  ),
  involvedPeople: z
    .array(InvolvedPerson)
    .default([])
    .meta(meta({ description: "People involved and how." })),
  equipmentOperatorId: PersonId.optional().meta(
    meta({
      description: "Person operating the equipment involved.",
      "x-requiredWhen": [
        { field: "incidentType", op: "in", value: ["near_miss", "property_damage"] },
        { field: "assetIds", op: "notEmpty" },
      ],
      "x-gapQuestion": "Who was operating {{assetIds}}?",
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
      }),
    ),
  recordable: z
    .boolean()
    .optional()
    .meta(
      meta({
        description: "OSHA recordable per 29 CFR 1904.7. Must cite the basis.",
        "x-requiredWhen": [{ field: "incidentType", op: "in", value: ["injury", "illness"] }],
      }),
    ),
  recordabilityBasis: z
    .string()
    .optional()
    .meta(meta({ description: "Why it is or is not recordable." })),
  immediateActions: z
    .array(z.string())
    .default([])
    .meta(
      meta({
        description: "Actions taken on the spot.",
        "x-extractionHint": "tagged out, stopped work, cleaned up, ice pack, roped off.",
      }),
    ),
});

/* ------------------------------------------------------------------ hazards & observations */

export const Hazard = RecordBase.extend({
  server: z.literal("hazards"),
  recordType: z.literal("hazard"),
  status: z.enum(["open", "mitigating", "closed"]),
  category: z
    .string()
    .meta(meta({ description: "Hazard taxonomy category id.", "x-picklist": "hazardCategory" })),
  riskLevel: RiskLevel.meta(
    meta({ description: "Current risk level.", "x-picklist": "riskLevel" }),
  ),
  identifiedAt: IsoDateTime,
  source: z.enum(["walkdown", "inspection", "incident", "audit", "employee_report"]),
});

export const Observation = RecordBase.extend({
  server: z.literal("hazards"),
  recordType: z.literal("observation"),
  status: z.enum(["open", "closed"]),
  observationType: z
    .enum(["unsafe_act", "unsafe_condition", "positive"])
    .meta(meta({ description: "Behaviour, condition, or positive recognition." })),
  category: z
    .string()
    .meta(meta({ description: "Hazard taxonomy category id.", "x-picklist": "hazardCategory" })),
  severity: severity("Potential severity."),
  observedAt: IsoDateTime,
  contractorId: z
    .string()
    .optional()
    .meta(meta({ description: "Contractor company, when a contractor was observed." })),
  personObserved: z
    .string()
    .optional()
    .meta(meta({ description: "Name or description of the person." })),
  stopWorkInvoked: z.boolean().default(false),
  spokeWithId: PersonId.optional().meta(meta({ description: "Person the observer spoke to." })),
});

/* ------------------------------------------------------------------ audits */

export const AuditFinding = z.strictObject({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: Severity,
  requirementRef: z.string().optional(),
  areaId: AreaId.optional(),
  observedAt: IsoDateTime,
  status: z.enum(["open", "closed"]),
  correctiveActions: z.array(CorrectiveAction).default([]),
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
  meetingType: z.enum(["toolbox_talk", "safety_committee", "shift_briefing", "stand_down"]),
  topic: z.string().meta(meta({ description: "Main topic covered." })),
  heldAt: IsoDateTime,
  durationMinutes: z.number().int().positive().optional(),
  facilitatorId: PersonId,
  attendees: z
    .array(Attendee)
    .default([])
    .meta(
      meta({
        description: "Attendees, matched to the roster where possible.",
        "x-gapQuestion": "Who is {{name}}? No match in the roster.",
      }),
    ),
  actionItems: z.array(ActionItem).default([]),
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
  course: z.string(),
  assigneeIds: z.array(PersonId).min(1),
  dueDate: IsoDate,
  reason: z.string(),
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
