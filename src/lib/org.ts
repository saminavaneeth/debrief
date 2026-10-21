import type { Area, Asset, Contractor, Organization, Person, Site } from "@/domain";

/** Fast lookups over the seeded organization (sites, areas, assets, people, roles). */
export class OrgDirectory {
  readonly sites = new Map<string, Site>();
  readonly areas = new Map<string, Area & { siteId: string }>();
  readonly assets = new Map<string, Asset>();
  readonly people = new Map<string, Person>();
  readonly roles = new Set<string>();
  readonly contractors = new Map<string, Contractor>();

  constructor(readonly org: Organization) {
    for (const site of org.sites) {
      this.sites.set(site.id, site);
      for (const area of site.areas) this.areas.set(area.id, { ...area, siteId: site.id });
    }
    for (const a of org.assets) this.assets.set(a.id, a);
    for (const p of org.people) this.people.set(p.id, p);
    for (const r of org.roles) this.roles.add(r.id);
    for (const c of org.contractors) this.contractors.set(c.id, c);
  }

  get utcOffset() {
    return this.org.utcOffset;
  }

  areaName(areaId: string | undefined): string | undefined {
    return areaId ? this.areas.get(areaId)?.name : undefined;
  }

  /** Person ids holding a role (used to resolve `role:<id>` owners and recipients). */
  peopleWithRole(role: string): string[] {
    return this.org.people.filter((p) => p.roles.includes(role)).map((p) => p.id);
  }
}
