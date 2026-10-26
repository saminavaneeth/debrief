"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type { ChangeSet, FieldSupport, GapQuestion, ProposedAction, RecordRef } from "@/domain";
import { cn } from "@/lib/utils";
import { PEOPLE } from "@/capture/reference";
import { Button } from "@/components/ui/button";
import type { EvidenceTarget } from "./evidence-drawer";
import { fieldLabel, formatItem, formatScalar } from "./format";

const TYPE_BADGE: Record<
  ProposedAction["type"],
  { label: string; icon: typeof Plus; tone: string }
> = {
  create: { label: "Create", icon: Plus, tone: "bg-emerald-100 text-emerald-900" },
  update: { label: "Update", icon: RefreshCw, tone: "bg-sky-100 text-sky-900" },
  link: { label: "Link", icon: Link2, tone: "bg-violet-100 text-violet-900" },
  attach: { label: "Attach", icon: Paperclip, tone: "bg-zinc-200 text-zinc-800" },
};

const RECORD_LABEL: Record<string, string> = {
  incident: "Incident",
  hazard: "Hazard",
  observation: "Observation",
  audit: "Audit",
  safety_meeting: "Safety meeting",
  inspection: "Inspection",
  training_assignment: "Training",
};

export function refLabel(ref: RecordRef, changeSet: ChangeSet): string {
  if ("id" in ref) return ref.id;
  const a = changeSet.actions.find((x) => x.id === ref.actionId);
  if (a?.type === "create")
    return `new ${RECORD_LABEL[a.recordType]?.toLowerCase() ?? a.recordType}${a.resultRecordId ? ` ${a.resultRecordId}` : ""}`;
  return ref.actionId;
}

function GapInput({ gap, onAnswer }: { gap: GapQuestion; onAnswer: (value: unknown) => void }) {
  const [text, setText] = useState("");
  const answered = gap.answer !== undefined;
  return (
    <div
      id={`gap-${gap.id}`}
      className={cn(
        "scroll-mt-20 space-y-2 rounded-xl border p-3",
        answered ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50",
      )}
    >
      <p className="flex items-start gap-2 text-[15px] font-medium">
        <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
        {gap.question}
      </p>
      {gap.blocking && !answered && (
        <p className="text-sm text-amber-900">
          Required by the target system. Answer it, or reject this action, before pushing.
        </p>
      )}
      {gap.answerType === "person" ? (
        <select
          aria-label={gap.question}
          value={typeof gap.answer === "string" ? gap.answer : ""}
          onChange={(e) => e.target.value && onAnswer(e.target.value)}
          className="bg-background h-12 w-full rounded-md border px-3 text-base"
        >
          <option value="">Choose a person…</option>
          {PEOPLE.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.title}
            </option>
          ))}
        </select>
      ) : gap.answerType === "choice" ? (
        <select
          aria-label={gap.question}
          value={typeof gap.answer === "string" ? gap.answer : ""}
          onChange={(e) => e.target.value && onAnswer(e.target.value)}
          className="bg-background h-12 w-full rounded-md border px-3 text-base"
        >
          <option value="">Choose…</option>
          {gap.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(gap.answerType === "number" ? Number(text) : text.trim());
          }}
        >
          <input
            aria-label={gap.question}
            type={
              gap.answerType === "number" ? "number" : gap.answerType === "date" ? "date" : "text"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="bg-background h-12 min-w-0 flex-1 rounded-md border px-3 text-base"
          />
          <Button type="submit" size="lg" className="h-12">
            Save
          </Button>
        </form>
      )}
      {answered && (
        <p className="text-sm text-emerald-800">
          Answered: {formatScalar(gap.fieldPath, gap.answer)}
        </p>
      )}
    </div>
  );
}

function FieldRow({
  path,
  value,
  support,
  onShow,
  onEdit,
}: {
  path: string;
  value: unknown;
  support?: FieldSupport;
  onShow: (t: EvidenceTarget) => void;
  onEdit?: (path: string, value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  // Free text and numbers are edited inline; people, places and dates come from evidence or gaps.
  const editable = onEdit && (FREE_TEXT.has(path) || typeof value === "number");
  const tag =
    support?.source === "user"
      ? "edited"
      : support?.source === "schema_default"
        ? "default"
        : support?.rule
          ? "derived"
          : null;
  return (
    <div className="flex items-start gap-2 py-2">
      <button
        type="button"
        onClick={() => onShow({ path, value, support })}
        className="min-w-0 flex-1 text-left"
      >
        <span className="text-muted-foreground block text-xs">
          {fieldLabel(path)}
          {tag && (
            <span className="bg-muted text-foreground ml-1.5 rounded px-1 py-px text-[10px] tracking-wide uppercase">
              {tag}
            </span>
          )}
          {(support?.citations.length ?? 0) > 0 && (
            <span className="ml-1.5 text-sky-700">· cited</span>
          )}
        </span>
        {editing ? null : Array.isArray(value) ? (
          <ul className="mt-0.5 space-y-0.5 text-[15px]">
            {value.length === 0 ? (
              <li>—</li>
            ) : (
              value.map((v, i) => <li key={i}>• {formatItem(path, v)}</li>)
            )}
          </ul>
        ) : (
          <span className="block text-[15px] break-words">{formatScalar(path, value)}</span>
        )}
      </button>
      {editing ? (
        <form
          className="flex flex-1 gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onEdit!(path, typeof value === "number" ? Number(draft) : draft);
            setEditing(false);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={fieldLabel(path)}
            className="h-11 min-w-0 flex-1 rounded-md border px-2 text-base"
          />
          <Button type="submit" size="icon-lg" className="size-11" aria-label="Save">
            <Check aria-hidden />
          </Button>
        </form>
      ) : (
        editable && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 shrink-0"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${fieldLabel(path)}`}
          >
            <Pencil aria-hidden />
          </Button>
        )
      )}
    </div>
  );
}

const FREE_TEXT = new Set([
  "description",
  "topic",
  "recordabilityBasis",
  "personObserved",
  "reason",
]);

/** Key facts shown on a collapsed card. */
const SUMMARY_KEYS = [
  "incidentType",
  "observationType",
  "meetingType",
  "category",
  "areaId",
  "occurredAt",
  "observedAt",
  "heldAt",
  "identifiedAt",
  "riskLevel",
  "severity",
];

function summary(action: ProposedAction): string {
  if (action.type === "create") {
    return SUMMARY_KEYS.filter((k) => action.payload[k] !== undefined)
      .slice(0, 4)
      .map((k) => formatScalar(k, action.payload[k]))
      .join(" · ");
  }
  if (action.type === "update") {
    const appended = action.patch
      .filter((p) => p.op === "append")
      .map((p) => `adds ${fieldLabel(p.path).toLowerCase()}`);
    const sets = action.patch.filter((p) => p.op === "set");
    const named = sets
      .slice(0, 3)
      .map((p) => `${fieldLabel(p.path).toLowerCase()} → ${formatScalar(p.path, p.value)}`);
    const more = sets.length > 3 ? [`${sets.length - 3} more changes`] : [];
    return [...named, ...more, ...appended].join(" · ");
  }
  return "";
}

export function ActionCard({
  action,
  changeSet,
  gaps,
  readOnly,
  result,
  onStatus,
  onEdit,
  onAnswer,
  onShowEvidence,
}: {
  action: ProposedAction;
  changeSet: ChangeSet;
  gaps: GapQuestion[];
  readOnly: boolean;
  result?: { status: string; recordId?: string; error?: string };
  onStatus: (status: "approved" | "proposed" | "rejected") => void;
  onEdit: (path: string, value: unknown) => void;
  onAnswer: (gap: GapQuestion, value: unknown) => void;
  onShowEvidence: (t: EvidenceTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const badge = TYPE_BADGE[action.type];
  const BadgeIcon = badge.icon;
  const rejected = action.status === "rejected";
  const approved = action.status === "approved" || action.status === "executed";

  const title =
    action.type === "create"
      ? String(action.payload.title ?? RECORD_LABEL[action.recordType])
      : action.type === "update"
        ? `${action.targetId}`
        : action.type === "link"
          ? `${refLabel(action.from, changeSet)} ${action.linkType === "foundDuring" ? "found during" : "related to"} ${refLabel(action.to, changeSet)}${action.toItemId ? ` (${action.toItemId})` : ""}`
          : `${action.artifactId} → ${refLabel(action.to, changeSet)}`;

  return (
    <article
      className={cn(
        "bg-card rounded-2xl border",
        rejected && "opacity-55",
        approved && !rejected && "border-emerald-400",
      )}
    >
      <header className="flex items-start gap-2 p-3.5">
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            badge.tone,
          )}
        >
          <BadgeIcon className="size-3.5" aria-hidden />
          {badge.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-semibold">{title}</p>
          <p className="text-muted-foreground text-xs">
            {"recordType" in action && `${RECORD_LABEL[action.recordType] ?? action.recordType} · `}
            {Math.round(action.confidence * 100)}% confidence ·{" "}
            {action.autonomy === "auto" ? "automatic" : "needs approval"}
          </p>
          {!open && summary(action) && (
            <p className="mt-1 text-sm leading-snug">{summary(action)}</p>
          )}
        </div>
        {(action.type === "create" || action.type === "update") && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-10"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Show details"
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
        )}
      </header>

      {open && action.type === "create" && (
        <div className="divide-y border-t px-3.5">
          {Object.entries(action.payload)
            .filter(([k]) => k !== "title")
            .map(([k, v]) => (
              <FieldRow
                key={k}
                path={k}
                value={v}
                support={action.fieldSupport[k]}
                onShow={onShowEvidence}
                onEdit={readOnly ? undefined : onEdit}
              />
            ))}
        </div>
      )}
      {open && action.type === "update" && (
        <ul className="divide-y border-t px-3.5">
          {action.patch.map((p, i) => {
            const support = Object.entries(action.fieldSupport).find(
              ([k]) => k === p.path || k.startsWith(`${p.path}[`),
            )?.[1];
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onShowEvidence({ path: p.path, value: p.value, support })}
                  className="w-full py-2 text-left"
                >
                  <span className="text-muted-foreground block text-xs">{fieldLabel(p.path)}</span>
                  {p.op === "append" ? (
                    <span className="block text-[15px]">
                      <span className="font-semibold text-emerald-700">+ </span>
                      {formatItem(p.path, p.value)}
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5 text-[15px]">
                      <span className="text-red-700 line-through">
                        {formatScalar(p.path, action.before[p.path])}
                      </span>
                      <ArrowRight className="size-3.5" aria-hidden />
                      <span className="font-medium text-emerald-800">
                        {formatScalar(p.path, p.value)}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 px-3.5 pb-3.5">
        {open && <p className="text-muted-foreground pt-2 text-sm">{action.rationale}</p>}
        {gaps.map((g) => (
          <GapInput key={g.id} gap={g} onAnswer={(v) => onAnswer(g, v)} />
        ))}
        {result ? (
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              result.status === "executed"
                ? "bg-emerald-50 text-emerald-900"
                : result.status === "failed"
                  ? "bg-red-50 text-red-900"
                  : "bg-muted",
            )}
          >
            {result.status === "executed"
              ? `Done${result.recordId ? ` · ${result.recordId}` : ""}`
              : result.status === "failed"
                ? `Failed: ${result.error}`
                : `Skipped${result.error ? `: ${result.error}` : ""}`}
          </p>
        ) : (
          !readOnly && (
            <div className="flex gap-2 pt-1">
              <Button
                variant={approved ? "default" : "outline"}
                size="lg"
                className="h-11 flex-1"
                onClick={() => onStatus(approved ? "proposed" : "approved")}
                aria-pressed={approved}
              >
                <Check aria-hidden />
                {approved
                  ? "Approved"
                  : action.autonomy === "auto"
                    ? "Approve (runs automatically)"
                    : "Approve"}
              </Button>
              <Button
                variant={rejected ? "destructive" : "outline"}
                size="lg"
                className="h-11"
                onClick={() => onStatus(rejected ? "proposed" : "rejected")}
                aria-pressed={rejected}
                aria-label={rejected ? "Undo reject" : "Reject"}
              >
                <X aria-hidden />
                {rejected ? "Rejected" : ""}
              </Button>
            </div>
          )
        )}
      </div>
    </article>
  );
}
