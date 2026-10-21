import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses scalars, quoted strings and inline lists", () => {
    const { data, body } = parseFrontmatter(
      '---\nid: sop-x\ntitle: "A: B"\ntags: [one, two]\nempty: []\n---\n# Body\n',
    );
    expect(data).toEqual({ id: "sop-x", title: "A: B", tags: ["one", "two"], empty: [] });
    expect(body).toBe("# Body\n");
  });

  it("handles CRLF line endings", () => {
    const { data } = parseFrontmatter("---\r\nid: a\r\n---\r\nbody");
    expect(data).toEqual({ id: "a" });
  });

  it("returns the whole source as body when there is no frontmatter", () => {
    expect(parseFrontmatter("# Title")).toEqual({ data: {}, body: "# Title" });
  });

  it("rejects malformed lines", () => {
    expect(() => parseFrontmatter("---\nnot a pair\n---\n")).toThrow(/Invalid frontmatter/);
  });
});
