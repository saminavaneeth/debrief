"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, RotateCcw, Search } from "lucide-react";
import type { ServerId } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatValue } from "./format";
import { RecordDetail, StatusBadge } from "./record-detail";
import type { ConsoleRecord, ConsoleServer, Lookup } from "./types";

const PREFIX_TO_SERVER: Record<string, ServerId> = {
  INC: "incidents",
  AUD: "audits",
  MTG: "meetings",
  HAZ: "hazards",
  OBS: "hazards",
  INS: "inspections",
  TRN: "training",
};

type Live = "connecting" | "live" | "offline";

export function EhsConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const server = (params.get("server") as ServerId | null) ?? "incidents";
  const selectedId = params.get("id");

  const [servers, setServers] = useState<ConsoleServer[]>([]);
  const [lookup, setLookup] = useState<Lookup>();
  // Records and the type filter are keyed by server, so switching tabs needs no reset effect.
  const [data, setData] = useState<{ server: ServerId; records: ConsoleRecord[] } | null>(null);
  const [filter, setFilter] = useState<{ server: ServerId; type: string } | null>(null);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<Live>("connecting");
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const serverRef = useRef(server);
  useEffect(() => {
    serverRef.current = server;
  }, [server]);

  const loading = data?.server !== server;
  const records = useMemo(() => (data?.server === server ? data.records : []), [data, server]);
  const typeFilter = filter?.server === server ? filter.type : "all";
  const setTypeFilter = (type: string) => setFilter({ server, type });

  const navigate = useCallback(
    (next: { server?: ServerId; id?: string | null }) => {
      const sp = new URLSearchParams(params.toString());
      if (next.server) sp.set("server", next.server);
      if (next.id === null) sp.delete("id");
      else if (next.id) sp.set("id", next.id);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const loadServers = useCallback(() => {
    void fetch("/api/console/servers", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ servers: ConsoleServer[]; lookup: Lookup }>)
      .then((body) => {
        setServers(body.servers);
        setLookup(body.lookup);
      });
  }, []);

  const loadRecords = useCallback((id: ServerId) => {
    void fetch(`/api/console/records?server=${id}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<{ records: ConsoleRecord[] }>)
      .then((body) => {
        if (serverRef.current === id) setData({ server: id, records: body.records });
      });
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    serverRef.current = server;
    loadRecords(server);
  }, [server, loadRecords]);

  useEffect(() => {
    const source = new EventSource("/api/console/events");
    source.addEventListener("ready", () => setLive("live"));
    source.addEventListener("change", (e) => {
      const change = JSON.parse((e as MessageEvent).data) as { kind: string; ids: string[] };
      loadServers();
      loadRecords(serverRef.current);
      if (change.ids.length) {
        setFlash((prev) => new Set([...prev, ...change.ids]));
        setTimeout(() => {
          setFlash((prev) => {
            const next = new Set(prev);
            change.ids.forEach((id) => next.delete(id));
            return next;
          });
        }, 4000);
      }
    });
    source.onerror = () => setLive("offline");
    source.onopen = () => setLive("live");
    return () => source.close();
  }, [loadServers, loadRecords]);

  const active = servers.find((s) => s.id === server);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (typeFilter !== "all" && r.recordType !== typeFilter) return false;
      if (!q) return true;
      return [r.id, r.title, r.description, r.status, r.areaId ?? "", ...r.assetIds]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [records, query, typeFilter]);
  const selected = records.find((r) => r.id === selectedId);

  const openRecord = (id: string) => {
    const target = PREFIX_TO_SERVER[id.split("-")[0]];
    if (target) navigate({ server: target, id });
  };

  const reset = async () => {
    if (
      !window.confirm(
        "Reset all EHS systems to the seed data? Records created in the demo will be removed.",
      )
    ) {
      return;
    }
    await fetch("/api/demo/reset", { method: "POST" });
    navigate({ id: null });
  };

  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">EHS systems</h1>
            <p className="text-muted-foreground text-sm">
              Cedar Valley Manufacturing · mock systems behind the MCP servers
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-muted-foreground flex items-center gap-1.5 text-sm"
              aria-live="polite"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  live === "live"
                    ? "bg-emerald-500"
                    : live === "connecting"
                      ? "bg-amber-400"
                      : "bg-red-500",
                )}
              />
              {live === "live" ? "Live" : live === "connecting" ? "Connecting" : "Offline"}
            </span>
            <Button variant="outline" size="lg" onClick={reset}>
              <RotateCcw aria-hidden />
              Reset demo
            </Button>
          </div>
        </div>
        <nav aria-label="Systems" className="mx-auto max-w-7xl overflow-x-auto px-4">
          <ul role="tablist" className="flex gap-1">
            {servers.map((s) => (
              <li key={s.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={s.id === server}
                  onClick={() => navigate({ server: s.id, id: null })}
                  className={cn(
                    "flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap",
                    s.id === server
                      ? "border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {s.displayName}
                  <span className="bg-muted rounded-full px-1.5 text-xs tabular-nums">
                    {s.recordCount}
                  </span>
                  {!s.enabled && (
                    <Badge variant="outline" className="text-xs">
                      not connected
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 md:grid-cols-[minmax(300px,380px)_1fr]">
        <section
          aria-label="Records"
          className={cn(
            "bg-background flex min-h-0 flex-col rounded-lg border",
            selected && "hidden md:flex",
          )}
        >
          <div className="space-y-2 border-b p-3">
            {active && <p className="text-muted-foreground text-sm">{active.description}</p>}
            {active && !active.enabled && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                This system is not connected to the gateway. Enable it on the Platform screen and
                the agent will start using it.
              </p>
            )}
            <label className="relative block">
              <span className="sr-only">Search records</span>
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search id, title, area, asset"
                className="bg-background focus-visible:ring-ring h-11 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
              />
            </label>
            {active && active.recordTypes.length > 1 && (
              <div className="flex gap-1" role="group" aria-label="Record type">
                {[{ recordType: "all", displayName: "All" }, ...active.recordTypes].map((t) => (
                  <Button
                    key={t.recordType}
                    size="sm"
                    variant={typeFilter === t.recordType ? "default" : "outline"}
                    onClick={() => setTypeFilter(t.recordType)}
                    aria-pressed={typeFilter === t.recordType}
                  >
                    {t.displayName}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <ul className="flex-1 divide-y overflow-y-auto md:max-h-[calc(100dvh-14rem)]">
            {loading && <li className="text-muted-foreground p-4 text-sm">Loading…</li>}
            {!loading && filtered.length === 0 && (
              <li className="text-muted-foreground p-4 text-sm">
                {records.length === 0 ? "No records yet." : "No records match."}
              </li>
            )}
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate({ id: r.id })}
                  aria-current={r.id === selectedId ? "true" : undefined}
                  className={cn(
                    "hover:bg-muted/60 w-full space-y-1 p-3 text-left transition-colors",
                    r.id === selectedId && "bg-muted",
                    flash.has(r.id) && "bg-amber-50 ring-2 ring-amber-300 ring-inset",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{r.id}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{r.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatValue("areaId", r.areaId ?? r.siteId, lookup)} · updated{" "}
                    {formatDateTime(r.updatedAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="Record detail"
          className={cn(
            "bg-background rounded-lg border p-4 md:p-6",
            !selected && "hidden md:block",
          )}
        >
          {selected ? (
            <>
              <Button
                variant="ghost"
                size="lg"
                className="mb-3 -ml-2 md:hidden"
                onClick={() => navigate({ id: null })}
              >
                <ChevronLeft aria-hidden />
                All records
              </Button>
              <RecordDetail record={selected} lookup={lookup} onNavigate={openRecord} />
            </>
          ) : (
            <div className="text-muted-foreground flex h-full min-h-60 items-center justify-center text-sm">
              {selectedId && !loading
                ? `Record ${selectedId} not found.`
                : "Select a record to see its details."}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
