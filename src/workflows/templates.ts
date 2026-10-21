import { getPath } from "@/mcp/servers/core/patch";

/**
 * `{{path}}` placeholders resolved against a context (the trigger record plus extras such as
 * `area`, `item`, `count`, `now`). A string that is only a placeholder keeps the value's type;
 * empty array entries are dropped (e.g. `["{{item.assetId}}"]` when there is no asset).
 */
export function render(value: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const whole = /^\{\{([\w.\[\]-]+)\}\}$/.exec(value);
    if (whole) return getPath(ctx, whole[1]);
    return value.replace(/\{\{([\w.\[\]-]+)\}\}/g, (_, p: string) => {
      const v = getPath(ctx, p);
      return Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v);
    });
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => render(v, ctx))
      .filter((v) => v !== undefined && v !== null && v !== "");
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = render(v, ctx);
      if (r !== undefined && r !== "") out[k] = r;
    }
    return out;
  }
  return value;
}
