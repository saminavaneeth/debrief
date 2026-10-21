import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/mcp/store/memory-store";
import { loadSeedRecords } from "@/lib/seed";

const seed = loadSeedRecords();
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "debrief-store-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("MemoryStore", () => {
  it("starts from seed, computes next ids per prefix and returns copies", async () => {
    const store = new MemoryStore({ seed, snapshotPath: null });
    expect((await store.list()).length).toBe(40);
    expect(await store.nextId("hazard")).toBe("HAZ-0013");
    expect(await store.nextId("observation")).toBe("OBS-0006");
    expect(await store.nextId("inspection")).toBe("INS-0022");
    expect(await store.nextId("training_assignment")).toBe("TRN-0001");
    const rec = (await store.get("HAZ-0007"))!;
    rec.title = "mutated";
    expect((await store.get("HAZ-0007"))!.title).toBe("FL-07 right-side mirror cracked");
  });

  it("snapshots every write and reloads it; reset restores the seed", async () => {
    const file = path.join(dir, "store.json");
    const a = new MemoryStore({ seed, snapshotPath: file });
    const rec = (await a.get("HAZ-0007"))!;
    await a.replace({ ...rec, title: "changed" });
    await a.putIdempotency({
      key: "k",
      server: "hazards",
      tool: "update_record",
      argsHash: "h",
      result: 1,
      at: "x",
    });

    const b = new MemoryStore({ seed, snapshotPath: file });
    expect((await b.get("HAZ-0007"))!.title).toBe("changed");
    expect(await b.getIdempotency("hazards", "k")).toMatchObject({ result: 1 });
    expect(await b.getIdempotency("incidents", "k")).toBeUndefined();

    await b.reset();
    expect((await b.get("HAZ-0007"))!.title).toBe("FL-07 right-side mirror cracked");
    const c = new MemoryStore({ seed, snapshotPath: file });
    expect((await c.get("HAZ-0007"))!.title).toBe("FL-07 right-side mirror cracked");
    expect(await c.getIdempotency("hazards", "k")).toBeUndefined();
  });

  it("read-only snapshots load but never write", async () => {
    const file = path.join(dir, "store.json");
    const writer = new MemoryStore({ seed, snapshotPath: file });
    await writer.replace({ ...(await writer.get("HAZ-0010"))!, title: "from app" });
    const reader = new MemoryStore({ seed, snapshotPath: file, readOnlySnapshot: true });
    expect((await reader.get("HAZ-0010"))!.title).toBe("from app");
    await reader.replace({ ...(await reader.get("HAZ-0010"))!, title: "from stdio" });
    const check = new MemoryStore({ seed, snapshotPath: file });
    expect((await check.get("HAZ-0010"))!.title).toBe("from app");
  });

  it("rejects duplicate inserts and missing replaces", async () => {
    const store = new MemoryStore({ seed, snapshotPath: null });
    const rec = (await store.get("HAZ-0007"))!;
    await expect(store.insert(rec)).rejects.toThrow(/exists/);
    await expect(store.replace({ ...rec, id: "HAZ-0999" })).rejects.toThrow(/not found/);
  });

  it("ignores an invalid snapshot and falls back to seed", async () => {
    const file = path.join(dir, "store.json");
    fs.writeFileSync(file, JSON.stringify({ version: 1, records: "nope" }));
    const original = console.warn;
    console.warn = () => {};
    try {
      const store = new MemoryStore({ seed, snapshotPath: file });
      expect((await store.list()).length).toBe(40);
    } finally {
      console.warn = original;
    }
  });
});
