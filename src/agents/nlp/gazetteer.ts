import type { OrgDirectory } from "@/lib/org";
import { fold, keywordPattern, type Span } from "./text";

export type EntityType = "person" | "area" | "site" | "asset" | "contractor";

export interface EntityMatch extends Span {
  type: EntityType;
  id: string;
  surface: string;
}

interface Entry {
  type: EntityType;
  id: string;
  phrase: string;
  /** Single-word names ("Luis", "Ben") only match when capitalised in the source. */
  needsCapital: boolean;
}

/**
 * Finds organization entities in text: people, areas, sites, assets and contractors by name and
 * alias, plus asset tags written as `FL-07`, `FE 115` or `V22`.
 */
export class Gazetteer {
  private entries: Entry[] = [];

  constructor(private readonly org: OrgDirectory) {
    const add = (type: EntityType, id: string, phrases: string[], people = false) => {
      for (const phrase of phrases) {
        if (!phrase.trim()) continue;
        const single = !/\s/.test(phrase.trim()) && !/[\d-]/.test(phrase);
        this.entries.push({ type, id, phrase, needsCapital: people && single });
      }
    };
    for (const p of org.org.people) add("person", p.id, [p.name, ...p.aliases], true);
    for (const s of org.org.sites) {
      add("site", s.id, [s.name, ...s.aliases]);
      for (const a of s.areas) add("area", a.id, [a.name, ...a.aliases]);
    }
    for (const a of org.org.assets) add("asset", a.id, a.aliases);
    for (const c of org.org.contractors) add("contractor", c.id, [c.name, ...c.aliases]);
    // Longest phrases first so "Ridgeline Steel Contractors" wins over "Ridgeline".
    this.entries.sort((a, b) => b.phrase.length - a.phrase.length);
  }

  find(text: string): EntityMatch[] {
    const found: EntityMatch[] = [];
    const taken = (start: number, end: number) => found.some((f) => start < f.end && end > f.start);

    // Asset tags: letters + optional separator + digits, normalised to the seeded id.
    const tag = /\b([A-Za-z]{1,3})[-\s]?(\d{2,3})\b/g;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(text))) {
      const id = `${m[1].toUpperCase()}-${m[2]}`;
      if (this.org.assets.has(id) && !taken(m.index, m.index + m[0].length)) {
        found.push({
          type: "asset",
          id,
          start: m.index,
          end: m.index + m[0].length,
          surface: m[0],
        });
      }
    }

    const folded = fold(text);
    for (const e of this.entries) {
      const re = keywordPattern(e.phrase);
      let hit: RegExpExecArray | null;
      while ((hit = re.exec(folded))) {
        const start = hit.index;
        const end = start + hit[0].length;
        if (taken(start, end)) continue;
        if (e.needsCapital && !/^[A-Z]/.test(text.slice(start, end))) continue;
        found.push({ type: e.type, id: e.id, start, end, surface: text.slice(start, end) });
      }
    }
    return found.sort((a, b) => a.start - b.start);
  }

  /** Exact match of a whole string (a sign-in sheet name) to one person. */
  personByName(name: string): string | undefined {
    const n = fold(name).replace(/\s+/g, " ").trim();
    for (const p of this.org.org.people) {
      for (const candidate of [p.name, ...p.aliases]) {
        if (fold(candidate).replace(/\s+/g, " ").trim() === n) return p.id;
      }
    }
    return undefined;
  }
}
