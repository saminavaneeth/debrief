/**
 * Minimal frontmatter parser for the knowledge docs. Supports `key: value`, quoted strings and
 * inline lists (`key: [a, b]`), which is all `data/knowledge/` uses.
 */
export function parseFrontmatter(source: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };

  const data: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) throw new Error(`Invalid frontmatter line: ${line}`);
    const key = line.slice(0, sep).trim();
    const raw = line.slice(sep + 1).trim();
    data[key] = parseValue(raw);
  }
  return { data, body: source.slice(match[0].length) };
}

function parseValue(raw: string): unknown {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    return inner ? inner.split(",").map((item) => unquote(item.trim())) : [];
  }
  return unquote(raw);
}

function unquote(value: string): string {
  if (value.length >= 2 && /^["'].*["']$/.test(value) && value[0] === value[value.length - 1]) {
    return value.slice(1, -1);
  }
  return value;
}
