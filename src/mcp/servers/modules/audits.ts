import type { ModuleDefinition } from "../core/module";

export const auditsModule: ModuleDefinition = {
  manifest: {
    server: "audits",
    displayName: "Audit Management",
    description: "Planned audits (internal, contractor, regulatory readiness) and their findings.",
    version: "1.0.0",
    recordTypes: [
      {
        recordType: "audit",
        displayName: "Audit",
        idPrefix: "AUD",
        description:
          "A planned audit with a scope; findings are appended as they are observed while the audit is in progress.",
        routing: {
          keywords: [
            "audit",
            "finding",
            "contractor",
            "subcontractor",
            "foreman",
            "non-compliance",
            "fall protection plan",
            "JHA",
            "scope",
            "Ridgeline",
          ],
          exampleSituations: [
            "Contractor worker not tied off during an open contractor safety audit",
            "Ladder missing inspection tag on the contractor's job",
          ],
          useWhen:
            "The observation falls within the scope of an audit that is planned or in progress (same contractor, same area), so it becomes a finding.",
          categories: ["falls_from_height", "ppe"],
        },
        matching: {
          strategy: "condition",
          openStatuses: ["planned", "in_progress"],
          signals: ["contractorId", "areaId"],
        },
        childCollections: ["findings", "correctiveActions"],
      },
    ],
    linkTypes: ["relatedTo", "causedBy", "resultedIn", "foundDuring"],
  },
  initialStatus: { audit: "planned" },
  picklists: {
    auditType: [
      { value: "contractor_safety", label: "Contractor safety" },
      { value: "internal_ehs", label: "Internal EHS" },
      { value: "regulatory_readiness", label: "Regulatory readiness" },
      { value: "housekeeping", label: "Housekeeping" },
    ],
  },
};
