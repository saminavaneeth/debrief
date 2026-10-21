"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { EhsRecord } from "@/domain";
import { useOnline, useRuns } from "@/capture/hooks";
import { Button } from "@/components/ui/button";

const PREFIX_SERVER: Record<string, string> = {
  INC: "incidents",
  HAZ: "hazards",
  OBS: "hazards",
  AUD: "audits",
  MTG: "meetings",
  INS: "inspections",
  TRN: "training",
};

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Records this device created or updated, grouped by push, newest first. */
export function RecordsScreen() {
  const runs = useRuns();
  const online = useOnline();
  const pushed = (runs ?? []).filter((r) => r.results);
  const written = pushed.map((run) => ({
    run,
    items: run.changeSet.actions
      .filter((a) => (a.type === "create" || a.type === "update") && a.status === "executed")
      .flatMap((a) => (a.resultRecordId ? [{ id: a.resultRecordId, kind: a.type }] : [])),
  }));
  const ids = [...new Set(written.flatMap((w) => w.items.map((i) => i.id)))].join(",");
  const [records, setRecords] = useState<Map<string, EhsRecord>>(new Map());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ids || !online) return;
    let cancelled = false;
    fetch(`/api/agent/records?ids=${encodeURIComponent(ids)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ records: EhsRecord[] }>)
      .then((b) => {
        if (cancelled) return;
        setRecords(new Map(b.records.map((r) => [r.id, r])));
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ids, online]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Records</h1>
        <p className="text-muted-foreground">
          Records you created or updated in the connected EHS systems.
        </p>
      </div>

      {runs !== undefined && written.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-muted-foreground">
            Nothing pushed from this device yet. Process a scenario, review it and push.
          </p>
          <Button asChild size="lg" className="h-12">
            <Link href="/process">
              <Sparkles aria-hidden />
              Process scenarios
            </Link>
          </Button>
        </div>
      )}

      {(failed || !online) && written.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Titles and statuses need a connection. Record IDs are shown from this device.
        </p>
      )}

      {written.map(({ run, items }) => (
        <section
          key={run.id}
          className="space-y-2"
          aria-label={`Pushed ${time(run.pushedAt ?? run.createdAt)}`}
        >
          <h2 className="text-muted-foreground text-sm font-medium">
            Pushed {time(run.pushedAt ?? run.createdAt)} ·{" "}
            <Link href={`/results?cs=${run.id}`} className="underline underline-offset-4">
              Results
            </Link>
          </h2>
          <ul className="bg-card divide-y rounded-2xl border">
            {items.map((item) => {
              const rec = records.get(item.id);
              const server = PREFIX_SERVER[item.id.split("-")[0]!] ?? "incidents";
              return (
                <li key={`${run.id}-${item.id}`}>
                  <Link
                    href={`/console?server=${server}&id=${item.id}`}
                    className="hover:bg-muted/60 flex min-h-14 items-center gap-3 p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs font-semibold">{item.id}</span>{" "}
                      <span className="text-muted-foreground text-xs">
                        {item.kind === "create" ? "created" : "updated"}
                        {rec ? ` · ${rec.status.replaceAll("_", " ")}` : ""}
                      </span>
                      {rec && <span className="block truncate font-medium">{rec.title}</span>}
                    </span>
                    <ArrowUpRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Link
        href="/console"
        className="hover:bg-muted inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-medium"
      >
        Open the EHS console
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
