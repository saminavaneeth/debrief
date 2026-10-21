import { describe, expect, it } from "vitest";
import { applyPatch, getPath, parsePath, PatchError } from "./patch";

describe("parsePath", () => {
  it("parses keys and selectors, including selectors with dots and spaces", () => {
    expect(parsePath("items[FE-115].response")).toEqual([
      { key: "items", selector: "FE-115" },
      { key: "response" },
    ]);
    expect(parsePath("attendees[T. Nguyen].personId")).toEqual([
      { key: "attendees", selector: "T. Nguyen" },
      { key: "personId" },
    ]);
    expect(parsePath("injury.treatment")).toEqual([{ key: "injury" }, { key: "treatment" }]);
  });

  it("rejects malformed paths", () => {
    expect(() => parsePath("items[FE-115")).toThrow(PatchError);
    expect(() => parsePath("a..b")).toThrow(PatchError);
    expect(() => parsePath("[x]")).toThrow(PatchError);
  });
});

describe("applyPatch", () => {
  const record = {
    id: "INS-0001",
    status: "scheduled",
    items: [
      { id: "FE-112", response: null },
      { id: "FE-115", response: null },
    ],
    attendees: [{ name: "T. Nguyen" }],
    notes: [] as unknown[],
  };

  it("sets nested values by item selector and reports before/after", () => {
    const { record: next, changes } = applyPatch(record, [
      { op: "set", path: "status", value: "completed" },
      { op: "set", path: "items[FE-115].response", value: "fail" },
      { op: "set", path: "attendees[T. Nguyen].personId", value: "P-099" },
      { op: "set", path: "injury.treatment", value: "first_aid" },
    ]);
    expect(getPath(next, "items[FE-115].response")).toBe("fail");
    expect(getPath(next, "attendees[0].personId")).toBe("P-099");
    expect(getPath(next, "injury.treatment")).toBe("first_aid");
    expect(changes[0]).toEqual({ path: "status", before: "scheduled", after: "completed" });
    expect(record.items[1].response).toBeNull(); // input untouched
  });

  it("appends to lists (creating them) and removes items", () => {
    const { record: next } = applyPatch(record, [
      { op: "append", path: "notes", value: { text: "x" } },
      { op: "append", path: "correctiveActions", value: { title: "y" } },
      { op: "remove", path: "items[FE-112]" },
    ]);
    expect(next.notes).toHaveLength(1);
    expect((next as Record<string, unknown>).correctiveActions).toEqual([{ title: "y" }]);
    expect(next.items.map((i) => i.id)).toEqual(["FE-115"]);
  });

  it("refuses protected fields and unknown items", () => {
    expect(() => applyPatch(record, [{ op: "set", path: "id", value: "X" }])).toThrow(
      /cannot be patched/,
    );
    expect(() => applyPatch(record, [{ op: "set", path: "history", value: [] }])).toThrow(
      PatchError,
    );
    expect(() =>
      applyPatch(record, [{ op: "set", path: "items[FE-999].response", value: "fail" }]),
    ).toThrow(/No item/);
    expect(() => applyPatch(record, [{ op: "append", path: "status", value: 1 }])).toThrow(
      /not a list/,
    );
  });
});
