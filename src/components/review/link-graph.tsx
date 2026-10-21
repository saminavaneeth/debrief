"use client";

import Link from "next/link";
import type { EhsRecord } from "@/domain";

const SERVER_COLOR: Record<string, string> = {
  incidents: "#dc2626",
  hazards: "#d97706",
  audits: "#7c3aed",
  meetings: "#0284c7",
  inspections: "#059669",
  training: "#db2777",
};

const LINK_LABEL: Record<string, string> = {
  relatedTo: "related to",
  foundDuring: "found during",
  causedBy: "caused by",
  resultedIn: "resulted in",
};

/**
 * Records changed in a push (filled) and the records they link to (outlined), with labelled
 * links. Each pair of records is drawn once.
 */
export function LinkGraph({ records, touched }: { records: EhsRecord[]; touched: Set<string> }) {
  const nodes = [...records].sort(
    (a, b) => Number(touched.has(b.id)) - Number(touched.has(a.id)) || a.id.localeCompare(b.id),
  );
  const W = 360;
  const ids = new Set(nodes.map((n) => n.id));
  const edges: { a: string; b: string; label: string }[] = [];
  const seen = new Set<string>();
  const adj = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]));
  for (const n of nodes) {
    for (const l of n.links) {
      if (!ids.has(l.targetId)) continue;
      adj.get(n.id)!.add(l.targetId);
      adj.get(l.targetId)!.add(n.id);
      const key = [n.id, l.targetId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        a: n.id,
        b: l.targetId,
        label: `${LINK_LABEL[l.type] ?? l.type}${l.itemId ? ` (${l.itemId})` : l.targetItemId ? ` (${l.targetItemId})` : ""}`,
      });
    }
  }

  // One band per group of linked records: the most-linked record on top, the rest below.
  const groups: string[][] = [];
  const placed = new Set<string>();
  for (const n of nodes) {
    if (placed.has(n.id)) continue;
    const group: string[] = [];
    const queue = [n.id];
    placed.add(n.id);
    while (queue.length) {
      const id = queue.shift()!;
      group.push(id);
      for (const next of adj.get(id)!) {
        if (placed.has(next)) continue;
        placed.add(next);
        queue.push(next);
      }
    }
    groups.push(group);
  }
  const BAND = 156;
  const pos = new Map<string, { x: number; y: number }>();
  groups.forEach((group, g) => {
    const top = g * BAND + 34;
    const hub = [...group].sort(
      (a, b) =>
        adj.get(b)!.size - adj.get(a)!.size || Number(touched.has(b)) - Number(touched.has(a)),
    )[0];
    const rest = group.filter((id) => id !== hub);
    pos.set(hub, { x: W / 2, y: rest.length ? top : top + 30 });
    rest.forEach((id, i) => pos.set(id, { x: ((i + 1) * W) / (rest.length + 1), y: top + 98 }));
  });
  const H = groups.length * BAND + 10;
  if (nodes.length === 0) return null;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="bg-card w-full rounded-2xl border"
        role="img"
        aria-label={`Link graph of ${nodes.length} records`}
      >
        {edges.map((e) => {
          const p = pos.get(e.a)!;
          const q = pos.get(e.b)!;
          return (
            <g key={`${e.a}-${e.b}`}>
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#94a3b8" strokeWidth={1.5} />
              <text
                x={p.x + (q.x - p.x) * 0.62}
                y={p.y + (q.y - p.y) * 0.62 - 4}
                fontSize={9}
                textAnchor="middle"
                fill="#475569"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {e.label}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const color = SERVER_COLOR[n.server] ?? "#334155";
          const isTouched = touched.has(n.id);
          return (
            <a
              key={n.id}
              href={`/console?server=${n.server}&id=${n.id}`}
              aria-label={`${n.id} ${n.title}`}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={17}
                fill={isTouched ? color : "#fff"}
                stroke={color}
                strokeWidth={2.5}
              />
              <text
                x={p.x}
                y={p.y + 3.5}
                fontSize={8.5}
                textAnchor="middle"
                fontWeight={700}
                fill={isTouched ? "#fff" : color}
              >
                {n.id.split("-")[0]}
              </text>
              <text
                x={p.x}
                y={p.y + 30}
                fontSize={9.5}
                textAnchor="middle"
                fontWeight={600}
                fill="#0f172a"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {n.id}
              </text>
            </a>
          );
        })}
      </svg>
      <figcaption className="text-muted-foreground text-xs">
        Filled: changed in this push. Outlined: linked records. Tap a record to open it in the EHS
        console.
      </figcaption>
      <ul className="space-y-1 text-sm">
        {nodes.map((n) => (
          <li key={n.id}>
            <Link
              href={`/console?server=${n.server}&id=${n.id}`}
              className="underline-offset-4 hover:underline"
            >
              <span className="font-mono font-semibold">{n.id}</span> {n.title}
            </Link>
          </li>
        ))}
      </ul>
    </figure>
  );
}
