import { z } from "zod";

/** Frontmatter of a markdown document in `data/knowledge/`. */
export const KnowledgeDocMeta = z.strictObject({
  id: z.string().regex(/^(sop|osha)-[a-z0-9-]+$/),
  title: z.string(),
  kind: z.enum(["sop", "regulation"]),
  /** CFR section for regulation summaries, e.g. "29 CFR 1904.7". */
  cfr: z.string().optional(),
  tags: z.array(z.string()).min(1),
  /** Hazard taxonomy categories this document grounds. */
  categories: z.array(z.string()).default([]),
});
export type KnowledgeDocMeta = z.infer<typeof KnowledgeDocMeta>;

export const HazardCategory = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).min(1),
  /** Default risk level when a hazard of this category is first drafted. */
  defaultRisk: z.enum(["low", "medium", "high", "critical"]),
  knowledgeDocIds: z.array(z.string()).default([]),
});

export const HazardTaxonomy = z.strictObject({
  version: z.string(),
  categories: z.array(HazardCategory).min(1),
});
export type HazardTaxonomy = z.infer<typeof HazardTaxonomy>;

export const ChecklistTemplate = z.strictObject({
  id: z.string().regex(/^tpl-[a-z0-9-]+$/),
  name: z.string(),
  recordType: z.literal("inspection"),
  frequency: z.enum(["daily", "pre_shift", "weekly", "monthly", "quarterly", "annual"]),
  appliesTo: z.string(),
  /** Each check is answered per item (per asset for asset-based templates). */
  checks: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z.string(),
        failMeans: z.string(),
        hazardCategory: z.string(),
      }),
    )
    .min(1),
  knowledgeDocIds: z.array(z.string()).default([]),
});
export type ChecklistTemplate = z.infer<typeof ChecklistTemplate>;
