import type { CallContext, WorkflowRule } from "@/domain";
import type { OrgDirectory } from "@/lib/org";
import { loadTaxonomy } from "@/lib/seed";
import { type Clock, toOffsetIso } from "@/lib/time";
import type { Gateway } from "@/mcp/gateway";

export interface RuleProposal {
  id: string;
  at: string;
  title: string;
  rationale: string;
  recordIds: string[];
  rule: WorkflowRule;
  status: "proposed" | "enabled" | "dismissed";
}

const WINDOW_DAYS = 60;
const CALL: CallContext = { actor: "agent", roles: ["workflow"], via: "agent" };

interface Hit {
  id: string;
  server: string;
  recordType: string;
  category?: string;
  assetIds: string[];
  title: string;
  eventAt: string;
}

/**
 * Heuristic pattern detection over recent records (read through the gateway):
 * - three or more hazards of one category within 60 days → notify the site manager of new ones;
 * - one asset in records of two or more types on different days (e.g. a hazard, later an
 *   incident) → when a new
 *   incident involves it, notify maintenance and suggest a review.
 * Proposals are disabled rules; an admin enables or dismisses them.
 */
export async function detectPatterns(
  gateway: Gateway,
  org: OrgDirectory,
  clock: Clock,
  existing: Set<string>,
): Promise<RuleProposal[]> {
  const now = clock.now();
  const at = toOffsetIso(now, org.utcOffset);
  const since = toOffsetIso(new Date(now.getTime() - WINDOW_DAYS * 86_400_000), org.utcOffset);
  const hits: Hit[] = [];
  for (const s of await gateway.discovery.servers()) {
    const page = await gateway.search(s.id, { from: since, limit: 100 }, CALL);
    hits.push(...(page.results as unknown as Hit[]).map((r) => ({ ...r, server: s.id })));
  }
  const out: RuleProposal[] = [];

  const byCategory = new Map<string, Hit[]>();
  for (const h of hits) {
    if (h.recordType !== "hazard" || !h.category) continue;
    byCategory.set(h.category, [...(byCategory.get(h.category) ?? []), h]);
  }
  const taxonomy = loadTaxonomy();
  for (const [category, list] of byCategory) {
    if (list.length < 3) continue;
    const name = (
      taxonomy.categories.find((c) => c.id === category)?.name ?? category.replaceAll("_", " ")
    ).toLowerCase();
    const id = `wf-proposed-category-${category.replaceAll("_", "-")}`;
    if (existing.has(id)) continue;
    out.push({
      id,
      at,
      title: `Notify the site manager about new ${name} hazards`,
      rationale: `${list.length} ${name} hazards in the last ${WINDOW_DAYS} days (${list.map((h) => h.id).join(", ")}).`,
      recordIds: list.map((h) => h.id),
      status: "proposed",
      rule: {
        id,
        name: `New ${name} hazard → site manager`,
        description: "Proposed from a pattern in recent hazards.",
        enabled: false,
        trigger: { event: "record.created", server: "hazards", recordType: "hazard" },
        conditions: [{ field: "category", op: "eq", value: category }],
        actions: [
          {
            type: "notify",
            to: "role:site_manager",
            template: `New ${name} hazard {{id}} at {{area}}: {{title}}`,
          },
        ],
      },
    });
  }

  const byAsset = new Map<string, Hit[]>();
  for (const h of hits)
    for (const a of h.assetIds ?? []) byAsset.set(a, [...(byAsset.get(a) ?? []), h]);
  for (const [asset, list] of byAsset) {
    const types = new Set(list.map((h) => h.recordType));
    // Separate occasions, not one event recorded in two systems.
    const days = new Set(list.map((h) => h.eventAt.slice(0, 10)));
    if (types.size < 2 || days.size < 2) continue;
    const id = `wf-proposed-asset-${asset.toLowerCase()}`;
    if (existing.has(id)) continue;
    out.push({
      id,
      at,
      title: `Flag new incidents involving ${asset}`,
      rationale: `${asset} appears in ${list.length} recent records of ${types.size} kinds (${list.map((h) => h.id).join(", ")}).`,
      recordIds: list.map((h) => h.id),
      status: "proposed",
      rule: {
        id,
        name: `Incident on ${asset} → maintenance review`,
        description: "Proposed from repeated issues on one asset.",
        enabled: false,
        trigger: { event: "record.created", server: "incidents", recordType: "incident" },
        conditions: [{ field: "assetIds", op: "contains", value: asset }],
        actions: [
          {
            type: "notify",
            to: "role:maintenance_tech",
            template: `Incident {{id}} involves ${asset}, which has other open issues.`,
          },
          {
            type: "suggest",
            title: `Review recurring issues on ${asset}`,
            template: `{{id}} is another record about ${asset}. Review its condition and history.`,
          },
        ],
      },
    });
  }
  return out;
}
