import org from "../../data/seed/org.json";
import taxonomy from "../../data/knowledge/hazard-taxonomy.json";

/**
 * Organization and taxonomy data bundled into the client so capture forms (area picker, asset
 * tags, quick-tag chips) work offline.
 */
export const SITES = org.sites;
export const AREAS = org.sites.flatMap((s) =>
  s.areas.map((a) => ({ ...a, siteId: s.id, label: `${s.name} · ${a.name}` })),
);
export const ASSETS = org.assets;
export const PEOPLE = org.people;
export const HAZARD_TAGS = taxonomy.categories.map((c) => ({ id: c.id, name: c.name }));

const areaById = new Map(AREAS.map((a) => [a.id, a]));
const tagById = new Map(HAZARD_TAGS.map((t) => [t.id, t.name]));
const personById = new Map(PEOPLE.map((p) => [p.id, p.name]));

export const areaLabel = (id?: string) => (id ? (areaById.get(id)?.label ?? id) : undefined);
export const siteName = (id?: string) => SITES.find((s) => s.id === id)?.name ?? id;
export const tagName = (id: string) => tagById.get(id) ?? id;
export const personName = (id: string) => personById.get(id) ?? id;
