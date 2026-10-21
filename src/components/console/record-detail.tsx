"use client";

import { ArrowUpRight, FileText, Image as ImageIcon, Mic, StickyNote, Video } from "lucide-react";
import type { CorrectiveAction, HistoryEntry } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime, formatValue, humanize, statusTone } from "./format";
import type { ConsoleRecord, Lookup } from "./types";

/** Envelope fields rendered in fixed places rather than in the generic field grid. */
const LAYOUT_KEYS = new Set([
  "id",
  "server",
  "recordType",
  "title",
  "description",
  "status",
  "notes",
  "correctiveActions",
  "links",
  "evidence",
  "history",
  "findings",
  "items",
  "attendees",
  "actionItems",
  "involvedPeople",
  "createdAt",
  "updatedAt",
  "createdBy",
]);

const MODALITY_ICON = {
  photo: ImageIcon,
  video: Video,
  voice: Mic,
  document: FileText,
  note: StickyNote,
};

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {title}
        {count !== undefined && <span className="ml-1.5 font-normal">({count})</span>}
      </h3>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusTone(status))}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function CorrectiveActions({ list, lookup }: { list: CorrectiveAction[]; lookup?: Lookup }) {
  if (list.length === 0) return null;
  return (
    <ul className="divide-y rounded-md border">
      {list.map((ca) => (
        <li key={ca.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{ca.title}</p>
            <p className="text-muted-foreground">
              {formatValue("ownerRef", ca.ownerRef, lookup)} · due {formatDateTime(ca.dueDate)} ·{" "}
              <span className="font-mono text-xs">{ca.id}</span>
            </p>
            {ca.citations.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Cites {ca.citations.map((c) => c.docId).join(", ")}
              </p>
            )}
          </div>
          <StatusBadge status={ca.status} />
        </li>
      ))}
    </ul>
  );
}

function History({ entries, lookup }: { entries: HistoryEntry[]; lookup?: Lookup }) {
  return (
    <ol className="space-y-3 border-l pl-4">
      {[...entries].reverse().map((h, i) => (
        <li key={i} className="relative text-sm">
          <span className="border-background bg-foreground/60 absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2" />
          <p>
            <span className="font-medium">{h.summary}</span>
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDateTime(h.at)} · {formatValue("by", h.by, lookup)}
            {h.changeSetId && (
              <>
                {" "}
                · change set <span className="font-mono">{h.changeSetId}</span>
              </>
            )}
          </p>
          {h.changes.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {h.changes.map((c, j) => (
                <li key={j} className="font-mono break-all">
                  {c.path}:{" "}
                  <span className="text-red-700 line-through">
                    {JSON.stringify(c.before) ?? "∅"}
                  </span>{" "}
                  → <span className="text-emerald-700">{JSON.stringify(c.after) ?? "∅"}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function RecordDetail({
  record,
  lookup,
  onNavigate,
}: {
  record: ConsoleRecord;
  lookup?: Lookup;
  onNavigate: (id: string) => void;
}) {
  const fields = Object.entries(record).filter(([k, v]) => !LAYOUT_KEYS.has(k) && v !== undefined);
  const findings = (record.findings as Record<string, unknown>[] | undefined) ?? [];
  const items = (record.items as Record<string, unknown>[] | undefined) ?? [];
  const attendees = (record.attendees as { personId?: string; name: string }[] | undefined) ?? [];
  const actionItems = (record.actionItems as Record<string, unknown>[] | undefined) ?? [];
  const involved =
    (record.involvedPeople as { personId?: string; name: string; role: string }[] | undefined) ??
    [];

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{record.id}</span>
          <Badge variant="secondary">{humanize(record.recordType)}</Badge>
          <StatusBadge status={record.status} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{record.title}</h2>
        {record.description && <p className="text-muted-foreground">{record.description}</p>}
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {fields.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{humanize(k)}</dt>
            <dd className="break-words">{formatValue(k, v, lookup)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-muted-foreground text-xs">Created</dt>
          <dd>
            {formatDateTime(record.createdAt)} ·{" "}
            {formatValue("createdBy", record.createdBy, lookup)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Updated</dt>
          <dd>{formatDateTime(record.updatedAt)}</dd>
        </div>
      </dl>

      {involved.length > 0 && (
        <Section title="People involved" count={involved.length}>
          <ul className="space-y-1 text-sm">
            {involved.map((p, i) => (
              <li key={i}>
                {p.name} <span className="text-muted-foreground">· {humanize(p.role)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {items.length > 0 && (
        <Section title="Checklist items" count={items.length}>
          <ul className="divide-y rounded-md border">
            {items.map((item) => (
              <li
                key={String(item.id)}
                className="flex items-start justify-between gap-2 p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p>{String(item.label)}</p>
                  {typeof item.notes === "string" && (
                    <p className="text-muted-foreground">{item.notes}</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "uppercase",
                    item.response === "fail" && "border-red-300 bg-red-100 text-red-900",
                    item.response === "pass" &&
                      "border-emerald-300 bg-emerald-100 text-emerald-900",
                  )}
                >
                  {item.response === null ? "pending" : String(item.response)}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {findings.length > 0 && (
        <Section title="Findings" count={findings.length}>
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={String(f.id)} className="space-y-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{String(f.title)}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Severity {String(f.severity)}</Badge>
                    <StatusBadge status={String(f.status)} />
                  </div>
                </div>
                <p className="text-muted-foreground">{String(f.description)}</p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-mono">{String(f.id)}</span> ·{" "}
                  {formatDateTime(String(f.observedAt))}
                  {typeof f.requirementRef === "string" && <> · {f.requirementRef}</>}
                </p>
                <CorrectiveActions
                  list={(f.correctiveActions as CorrectiveAction[]) ?? []}
                  lookup={lookup}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {attendees.length > 0 && (
        <Section title="Attendees" count={attendees.length}>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {attendees.map((a, i) => (
              <li key={i}>
                {a.personId ? (lookup?.people[a.personId] ?? a.name) : a.name}
                {!a.personId && (
                  <span className="ml-1 text-xs text-amber-700">(not in roster)</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {actionItems.length > 0 && (
        <Section title="Action items" count={actionItems.length}>
          <ul className="divide-y rounded-md border">
            {actionItems.map((a) => (
              <li
                key={String(a.id)}
                className="flex items-start justify-between gap-2 p-2.5 text-sm"
              >
                <div>
                  <p>{String(a.title)}</p>
                  <p className="text-muted-foreground">
                    {formatValue("ownerRef", a.ownerRef, lookup)}
                    {typeof a.dueDate === "string" && <> · due {formatDateTime(a.dueDate)}</>}
                  </p>
                </div>
                <StatusBadge status={String(a.status)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {record.correctiveActions.length > 0 && (
        <Section title="Corrective actions" count={record.correctiveActions.length}>
          <CorrectiveActions list={record.correctiveActions} lookup={lookup} />
        </Section>
      )}

      {record.notes.length > 0 && (
        <Section title="Notes" count={record.notes.length}>
          <ul className="space-y-2 text-sm">
            {record.notes.map((n, i) => (
              <li key={i} className="bg-muted/60 rounded-md p-2.5">
                <p>{n.text}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(n.at)} · {formatValue("by", n.by, lookup)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Links" count={record.links.length}>
        {record.links.length === 0 ? (
          <p className="text-muted-foreground text-sm">No linked records.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {record.links.map((l, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onNavigate(l.targetId)}
                  className="hover:bg-muted inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {l.itemId && <span className="font-mono">{l.itemId} </span>}
                    {humanize(l.type)}
                  </span>
                  <span className="font-mono font-medium">{l.targetId}</span>
                  {l.targetItemId && (
                    <span className="text-muted-foreground font-mono">({l.targetItemId})</span>
                  )}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Evidence" count={record.evidence.length}>
        {record.evidence.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attached evidence.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {record.evidence.map((e) => {
              const Icon = MODALITY_ICON[e.modality];
              return (
                <li key={e.artifactId} className="flex items-center gap-2">
                  <Icon className="text-muted-foreground size-4" aria-hidden />
                  <span className="font-mono">{e.artifactId}</span>
                  <span className="text-muted-foreground">
                    {e.caption ?? e.uri ?? e.modality} · {formatDateTime(e.attachedAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="History" count={record.history.length}>
        <History entries={record.history} lookup={lookup} />
      </Section>
    </article>
  );
}
