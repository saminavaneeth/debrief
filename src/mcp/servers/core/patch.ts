import type { PatchOp } from "@/domain";

/**
 * Patch paths: dot-separated keys, each optionally followed by `[selector]` to pick an array
 * element. A selector matches an element's `id`, then its `name`, then a numeric index:
 * `items[FE-115].response`, `findings[AUD-0004-F3].correctiveActions`, `attendees[T. Nguyen]`.
 */
export type PathSegment = { key: string; selector?: string };

export class PatchError extends Error {}

/** Fields only the server or the dedicated tools may change. */
export const PROTECTED_ROOT_FIELDS = new Set([
  "id",
  "server",
  "recordType",
  "createdAt",
  "updatedAt",
  "createdBy",
  "history",
  "links",
  "evidence",
]);

export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let key = "";
  let i = 0;
  while (i < path.length) {
    const ch = path[i];
    if (ch === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) throw new PatchError(`Unclosed "[" in path "${path}"`);
      if (!key) throw new PatchError(`Selector without a key in path "${path}"`);
      segments.push({ key, selector: path.slice(i + 1, close) });
      key = "";
      i = close + 1;
      if (path[i] === ".") i++;
      else if (i < path.length) throw new PatchError(`Expected "." after "]" in path "${path}"`);
      continue;
    }
    if (ch === ".") {
      if (!key) throw new PatchError(`Empty segment in path "${path}"`);
      segments.push({ key });
      key = "";
    } else {
      key += ch;
    }
    i++;
  }
  if (key) segments.push({ key });
  if (segments.length === 0) throw new PatchError("Empty path");
  return segments;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function findIndex(list: unknown[], selector: string): number {
  let idx = list.findIndex((el) => isObj(el) && el.id === selector);
  if (idx === -1) idx = list.findIndex((el) => isObj(el) && el.name === selector);
  if (idx === -1 && /^\d+$/.test(selector) && Number(selector) < list.length)
    idx = Number(selector);
  return idx;
}

/** Read a value at a path; `undefined` when any step is missing. */
export function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of parsePath(path)) {
    if (!isObj(cur)) return undefined;
    cur = cur[seg.key];
    if (seg.selector !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      const idx = findIndex(cur, seg.selector);
      cur = idx === -1 ? undefined : cur[idx];
    }
  }
  return cur;
}

/** Walk to the container of the last segment, creating plain objects for missing keys. */
function resolveParent(root: Obj, segments: PathSegment[], path: string): Obj {
  let cur: Obj = root;
  for (const seg of segments.slice(0, -1)) {
    let next = cur[seg.key];
    if (seg.selector !== undefined) {
      if (!Array.isArray(next)) throw new PatchError(`"${seg.key}" is not a list in "${path}"`);
      const idx = findIndex(next, seg.selector);
      if (idx === -1) throw new PatchError(`No item "${seg.selector}" in "${seg.key}"`);
      next = next[idx];
    } else if (next === undefined) {
      next = {};
      cur[seg.key] = next;
    }
    if (!isObj(next)) throw new PatchError(`Cannot descend into "${seg.key}" in "${path}"`);
    cur = next;
  }
  return cur;
}

export interface FieldChangeOut {
  path: string;
  before?: unknown;
  after?: unknown;
}

/** Apply patch ops to a copy of `record`. Throws `PatchError` on invalid paths. */
export function applyPatch<T extends Obj>(
  record: T,
  ops: PatchOp[],
): { record: T; changes: FieldChangeOut[] } {
  const next = structuredClone(record) as Obj;
  const changes: FieldChangeOut[] = [];

  for (const op of ops) {
    const segments = parsePath(op.path);
    if (PROTECTED_ROOT_FIELDS.has(segments[0].key)) {
      throw new PatchError(`"${segments[0].key}" cannot be patched`);
    }
    const parent = resolveParent(next, segments, op.path);
    const last = segments[segments.length - 1];
    const before = structuredClone(getPath(next, op.path));

    switch (op.op) {
      case "set": {
        if (op.value === undefined) throw new PatchError(`"set" needs a value at "${op.path}"`);
        if (last.selector !== undefined) {
          const list = parent[last.key];
          if (!Array.isArray(list)) throw new PatchError(`"${last.key}" is not a list`);
          const idx = findIndex(list, last.selector);
          if (idx === -1) throw new PatchError(`No item "${last.selector}" in "${last.key}"`);
          list[idx] = structuredClone(op.value);
        } else {
          parent[last.key] = structuredClone(op.value);
        }
        break;
      }
      case "append": {
        if (op.value === undefined) throw new PatchError(`"append" needs a value at "${op.path}"`);
        if (last.selector !== undefined) throw new PatchError(`Append to a list, not an item`);
        const list = parent[last.key] ?? [];
        if (!Array.isArray(list)) throw new PatchError(`"${op.path}" is not a list`);
        list.push(structuredClone(op.value));
        parent[last.key] = list;
        break;
      }
      case "remove": {
        if (last.selector !== undefined) {
          const list = parent[last.key];
          if (!Array.isArray(list)) throw new PatchError(`"${last.key}" is not a list`);
          const idx = findIndex(list, last.selector);
          if (idx === -1) throw new PatchError(`No item "${last.selector}" in "${last.key}"`);
          list.splice(idx, 1);
        } else {
          delete parent[last.key];
        }
        break;
      }
    }
    changes.push({ path: op.path, before, after: structuredClone(getPath(next, op.path)) });
  }
  return { record: next as T, changes };
}
