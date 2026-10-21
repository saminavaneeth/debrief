/**
 * Text utilities for the rule-based engine. All offsets refer to the original text: `fold()`
 * keeps the string length, so matches found in the folded copy map straight back to spans.
 */

/** Lower-case and replace hyphens and curly quotes one-for-one (same length as the input). */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐-―-]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

export interface Span {
  start: number;
  end: number;
}

export interface Sentence extends Span {
  text: string;
}

/** Split into sentences on . ! ? and line breaks, keeping offsets. */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+(?:[.!?]+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length < 2) continue;
    const start = m.index + lead;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const patternCache = new Map<string, RegExp>();

/** Whole-word, case-insensitive pattern; `*` matches up to three words. */
export function keywordPattern(keyword: string): RegExp {
  let re = patternCache.get(keyword);
  if (!re) {
    const words = fold(keyword).trim().split(/\s+/);
    let body = "";
    words.forEach((w, i) => {
      if (w === "*") body += "(?:\\S+\\s+){0,3}?";
      else body += escape(w) + (i < words.length - 1 ? "\\s+" : "");
    });
    re = new RegExp(`(?<![\\w'])${body}(?![\\w'])`, "g");
    patternCache.set(keyword, re);
  }
  re.lastIndex = 0;
  return re;
}

/** Words that negate or defer a following term ("hasn't been fixed", "until it is replaced"). */
const NEGATORS = new Set([
  "no",
  "not",
  "never",
  "without",
  "hasn't",
  "hasnt",
  "haven't",
  "isn't",
  "wasn't",
  "didn't",
  "doesn't",
  "don't",
  "won't",
  "until",
  "unless",
  "once",
  "needs",
  "need",
  "will",
]);

/** True when one of the three words before `start` negates or defers the term. */
export function isNegated(folded: string, start: number): boolean {
  const before = folded
    .slice(Math.max(0, start - 40), start)
    .split(/[^\w']+/)
    .filter(Boolean);
  return before.slice(-3).some((w) => NEGATORS.has(w));
}

export interface KeywordHit extends Span {
  keyword: string;
  negated: boolean;
}

/** Every occurrence of each keyword (whole words, case-insensitive). */
export function findKeywords(text: string, keywords: readonly string[]): KeywordHit[] {
  const folded = fold(text);
  const hits: KeywordHit[] = [];
  for (const keyword of keywords) {
    const re = keywordPattern(keyword);
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded))) {
      hits.push({
        keyword,
        start: m.index,
        end: m.index + m[0].length,
        negated: isNegated(folded, m.index),
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Distinct keywords that occur at least once (optionally ignoring negated occurrences). */
export function matchedKeywords(
  text: string,
  keywords: readonly string[],
  skipNegated = false,
): string[] {
  return [
    ...new Set(
      findKeywords(text, keywords)
        .filter((h) => !(skipNegated && h.negated))
        .map((h) => h.keyword),
    ),
  ];
}

export function truncate(text: string, max: number): string {
  const clean = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[,;:]$/, "")}…`;
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
