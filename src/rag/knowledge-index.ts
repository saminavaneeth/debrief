import MiniSearch from "minisearch";
import {
  ChecklistTemplate,
  type HazardTaxonomy,
  type KnowledgeCitation,
  KnowledgeDocMeta,
} from "@/domain";
import { dataPath, listFiles, listFilesDeep, readJson, readMarkdown } from "@/lib/data-files";
import { loadTaxonomy } from "@/lib/seed";
import { hybridScore } from "./embedder";

export interface KnowledgeChunk {
  id: string;
  docId: string;
  title: string;
  kind: "sop" | "regulation";
  cfr?: string;
  section: string;
  text: string;
  tags: string[];
  categories: string[];
}

/** One line of "Corrective action guidance": situation → action | owner | due | keywords. */
export interface Guidance {
  docId: string;
  section: string;
  situation: string;
  action: string;
  ownerRef: string;
  dueDays: number;
  keywords: string[];
  line: string;
}

export interface KnowledgeHit {
  chunk: KnowledgeChunk;
  score: number;
  /** The line of the chunk that best matches the query. */
  excerpt: string;
}

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9.()]+/)
    .filter((t) => t.length > 1);

function parseGuidance(docId: string, section: string, body: string): Guidance[] {
  const out: Guidance[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/^\s*-\s*/, "").trim();
    const m = /^(.+?)\s*→\s*(.+)$/.exec(line);
    if (!m) continue;
    const [action, ...attrs] = m[2].split("|").map((s) => s.trim());
    const attr = (k: string) =>
      attrs
        .find((a) => a.startsWith(`${k}:`))
        ?.slice(k.length + 1)
        .trim();
    const owner = attr("owner");
    const due = attr("due");
    if (!owner || due === undefined) continue;
    out.push({
      docId,
      section,
      situation: m[1].trim(),
      action,
      ownerRef: owner,
      dueDays: Number(/\d+/.exec(due)?.[0] ?? 0),
      keywords: (attr("keywords") ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      line,
    });
  }
  return out;
}

/**
 * SOPs and regulation summaries chunked by `##` section, the hazard taxonomy and checklist
 * templates. Grounds classifications and corrective-action suggestions with citations.
 */
export class KnowledgeIndex {
  readonly chunks: KnowledgeChunk[] = [];
  readonly guidance: Guidance[] = [];
  readonly taxonomy: HazardTaxonomy;
  readonly templates: ChecklistTemplate[];
  private search: MiniSearch<KnowledgeChunk>;
  private docs = new Map<string, { title: string; kind: "sop" | "regulation"; cfr?: string }>();

  constructor() {
    this.taxonomy = loadTaxonomy();
    this.templates = listFiles(dataPath("data", "knowledge", "checklists"), ".json").map((f) =>
      ChecklistTemplate.parse(readJson(f)),
    );
    for (const file of listFilesDeep(dataPath("data", "knowledge"), ".md")) {
      const { data, body } = readMarkdown(file);
      const meta = KnowledgeDocMeta.parse(data);
      this.docs.set(meta.id, { title: meta.title, kind: meta.kind, cfr: meta.cfr });
      const sections = body.split(/^## /m).slice(1);
      for (const s of sections) {
        const nl = s.indexOf("\n");
        const heading = s.slice(0, nl).trim();
        const text = s.slice(nl + 1).trim();
        this.chunks.push({
          id: `${meta.id}#${heading
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}`,
          docId: meta.id,
          title: meta.title,
          kind: meta.kind,
          ...(meta.cfr ? { cfr: meta.cfr } : {}),
          section: heading,
          text,
          tags: meta.tags,
          categories: meta.categories,
        });
        if (/corrective action guidance/i.test(heading))
          this.guidance.push(...parseGuidance(meta.id, heading, text));
      }
    }
    this.search = new MiniSearch<KnowledgeChunk>({
      fields: ["title", "section", "text", "tagText"],
      storeFields: ["id"],
      extractField: (doc, field) =>
        field === "tagText"
          ? doc.tags.join(" ")
          : (doc as unknown as Record<string, string>)[field],
      searchOptions: { prefix: true, fuzzy: 0.15, boost: { section: 2, tagText: 2 } },
    });
    this.search.addAll(this.chunks);
  }

  docTitle(docId: string) {
    return this.docs.get(docId)?.title ?? docId;
  }

  category(id: string) {
    return this.taxonomy.categories.find((c) => c.id === id);
  }

  /** Docs linked to a category in the taxonomy, regulations first. */
  docsForCategory(categoryId: string): string[] {
    const ids = this.category(categoryId)?.knowledgeDocIds ?? [];
    const rank = (id: string) => (this.docs.get(id)?.kind === "regulation" ? 0 : 1);
    return [...ids].sort((a, b) => rank(a) - rank(b));
  }

  query(
    text: string,
    filter: { docIds?: string[]; kind?: "sop" | "regulation"; limit?: number } = {},
  ): KnowledgeHit[] {
    const raw = this.search.search(text, {
      combineWith: "OR",
      filter: (r) => {
        const c = this.chunks.find((x) => x.id === r.id)!;
        return (
          (!filter.docIds || filter.docIds.includes(c.docId)) &&
          (!filter.kind || c.kind === filter.kind)
        );
      },
    });
    const max = raw[0]?.score ?? 0;
    const qTokens = new Set(tokenize(text));
    return raw.slice(0, filter.limit ?? 5).map((r) => {
      const chunk = this.chunks.find((x) => x.id === r.id)!;
      const lines = chunk.text
        .split("\n")
        .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
        .filter(Boolean);
      let excerpt = lines[0] ?? "";
      let best = -1;
      for (const l of lines) {
        const overlap = tokenize(l).filter((t) => qTokens.has(t)).length;
        if (overlap > best) {
          best = overlap;
          excerpt = l;
        }
      }
      return { chunk, score: hybridScore(r.score, max), excerpt };
    });
  }

  citation(hit: KnowledgeHit): KnowledgeCitation {
    return { docId: hit.chunk.docId, section: hit.chunk.section, excerpt: hit.excerpt };
  }

  /**
   * Corrective-action guidance lines for a category that match the evidence: the best line, plus
   * any other line matching at least two of its keywords (at most three).
   */
  guidanceFor(categoryId: string, text: string): Guidance[] {
    const docIds = new Set(this.category(categoryId)?.knowledgeDocIds ?? []);
    const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    const scored = this.guidance
      .filter((g) => docIds.has(g.docId))
      .map((g) => ({
        g,
        score: g.keywords.filter((k) =>
          t.includes(
            ` ${k
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim()} `,
          ),
        ).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored
      .filter((x, i) => i === 0 || x.score >= 2)
      .slice(0, 3)
      .map((x) => x.g);
  }

  /** The regulation paragraph for a category that best matches the evidence. */
  regulationFor(
    categoryId: string,
    text: string,
  ): { citation: KnowledgeCitation; reference: string } | undefined {
    const docIds = this.docsForCategory(categoryId).filter(
      (d) => this.docs.get(d)?.kind === "regulation",
    );
    if (docIds.length === 0) return undefined;
    // Prefer sections that name a paragraph, e.g. "Unprotected sides and edges — 1926.501(b)(1)".
    const hits = this.query(text, { docIds, limit: 10 });
    const hit = hits.find((h) => /\d{4}\.\d+\(/.test(h.chunk.section)) ?? hits[0];
    if (!hit) return undefined;
    const para = /(\d{4}\.\d+(?:\([a-z0-9]+\))*)/i.exec(hit.chunk.section)?.[1];
    const reference = para ? `29 CFR ${para}` : (hit.chunk.cfr ?? hit.chunk.title);
    return { citation: this.citation(hit), reference };
  }
}

let shared: KnowledgeIndex | undefined;
export const getKnowledgeIndex = () => (shared ??= new KnowledgeIndex());
