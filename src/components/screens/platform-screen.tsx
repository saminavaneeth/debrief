"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  AuditEntry,
  PolicyConfig,
  WorkflowNotification,
  WorkflowRule,
  WorkflowRunEntry,
  WorkflowSuggestion,
} from "@/domain";
import { cn } from "@/lib/utils";
import { useRuns } from "@/capture/hooks";
import type { EvalReport, Ratio } from "@/evals/run-evals";
import { Button } from "@/components/ui/button";

interface ServerInfo {
  id: string;
  enabled: boolean;
  transport: string;
  displayName: string;
  description: string;
  recordTypes: {
    recordType: string;
    displayName: string;
    idPrefix: string;
    keywords: string[];
    useWhen: string;
  }[];
  tools: { name: string; description?: string }[];
  recordCount: number;
}
type RuleInfo = WorkflowRule & {
  evaluations: number;
  fired: number;
  lastRun: WorkflowRunEntry | null;
};
interface Proposal {
  id: string;
  title: string;
  rationale: string;
  recordIds: string[];
  rule: WorkflowRule;
  status: "proposed" | "enabled" | "dismissed";
}
interface PlatformState {
  servers: ServerInfo[];
  policy: PolicyConfig;
  rules: RuleInfo[];
  proposals: Proposal[];
  notifications: WorkflowNotification[];
  suggestions: WorkflowSuggestion[];
  runs: WorkflowRunEntry[];
  audit: AuditEntry[];
  evals: EvalReport | null;
  unread: number;
}

const TABS = [
  ["systems", "Systems"],
  ["workflows", "Workflows"],
  ["activity", "Activity"],
  ["policy", "Policy"],
  ["audit", "Audit log"],
  ["runs", "Run traces"],
  ["evals", "Evals"],
] as const;
type Tab = (typeof TABS)[number][0];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/platform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return res.json();
}

function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-emerald-600" : "bg-zinc-300",
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-6 rounded-full bg-white shadow transition-all",
          on ? "left-7" : "left-1",
        )}
      />
    </button>
  );
}

const time = (iso: string) => iso.slice(11, 16);
const pct = (r: Ratio) => `${(r.value * 100).toFixed(1)}%`;

function Systems({
  state,
  act,
}: {
  state: PlatformState;
  act: (b: Record<string, unknown>, msg?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="space-y-3">
      {state.servers.map((s) => (
        <li key={s.id} className="bg-card space-y-2 rounded-2xl border p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.displayName}</p>
              <p className="text-muted-foreground text-sm">
                <span className="font-mono">{s.id}</span> · {s.transport} · {s.recordCount} records
                · {s.enabled ? `${s.tools.length} tools` : "not connected"}
              </p>
            </div>
            <Toggle
              on={s.enabled}
              label={`Connect ${s.displayName}`}
              onChange={(v) =>
                act(
                  { action: "server.toggle", id: s.id, enabled: v },
                  v
                    ? `${s.displayName} connected; the agent will use it on the next run`
                    : `${s.displayName} disconnected`,
                )
              }
            />
          </div>
          <p className="text-sm">{s.description}</p>
          <button
            type="button"
            onClick={() => setOpen(open === s.id ? null : s.id)}
            className="flex min-h-10 items-center gap-1 text-sm font-medium"
            aria-expanded={open === s.id}
          >
            <ChevronDown
              className={cn("size-4 transition-transform", open === s.id && "rotate-180")}
              aria-hidden
            />
            Record types and tools
          </button>
          {open === s.id && (
            <div className="space-y-3 text-sm">
              {s.recordTypes.map((t) => (
                <div key={t.recordType} className="bg-muted/50 rounded-xl p-3">
                  <p className="font-medium">
                    {t.displayName}{" "}
                    <span className="text-muted-foreground font-mono text-xs">{t.idPrefix}-</span>
                  </p>
                  <p className="text-muted-foreground">{t.useWhen}</p>
                  <p className="mt-1 text-xs">Routing hints: {t.keywords.join(", ")}…</p>
                </div>
              ))}
              {s.tools.length > 0 ? (
                <ul className="space-y-1">
                  {s.tools.map((t) => (
                    <li key={t.name}>
                      <span className="font-mono text-xs font-semibold">{t.name}</span>
                      {t.description && (
                        <span className="text-muted-foreground"> — {t.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Connect the server to discover its tools.</p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function describeRule(r: WorkflowRule) {
  const events = [r.trigger.event].flat().join(" or ");
  const where = r.conditions
    .map((c) => `${c.field} ${c.op} ${c.value === undefined ? "" : JSON.stringify(c.value)}`)
    .join(", ");
  const agg = r.aggregate
    ? ` · ${r.aggregate.count.op} ${r.aggregate.count.value} per ${r.aggregate.groupBy} in ${r.aggregate.window}`
    : "";
  const each = r.forEach
    ? ` · for each ${r.forEach.path} item${r.forEach.unlessLinked ? ` without a linked ${r.forEach.unlessLinked}` : ""}`
    : "";
  return `When ${events}${r.trigger.recordType ? ` (${r.trigger.recordType})` : ""}${where ? ` where ${where}` : ""}${agg}${each} → ${r.actions.map((a) => a.type).join(", ")}`;
}

function Workflows({
  state,
  act,
}: {
  state: PlatformState;
  act: (b: Record<string, unknown>, msg?: string) => Promise<void>;
}) {
  const proposals = state.proposals.filter((p) => p.status === "proposed");
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Proposed rules</h2>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            onClick={() => act({ action: "proposals.scan" }, "Looked for patterns")}
          >
            <Sparkles aria-hidden />
            Find patterns
          </Button>
        </div>
        {proposals.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No proposals. The agent looks for repeated issues on an asset and clusters of hazards by
            category.
          </p>
        ) : (
          proposals.map((p) => (
            <div
              key={p.id}
              className="space-y-2 rounded-2xl border border-violet-300 bg-violet-50 p-4"
            >
              <p className="font-semibold">{p.title}</p>
              <p className="text-sm">{p.rationale}</p>
              <p className="text-muted-foreground text-xs">{describeRule(p.rule)}</p>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  className="h-11"
                  onClick={() => act({ action: "proposal.enable", id: p.id }, "Rule enabled")}
                >
                  Enable rule
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11"
                  onClick={() => act({ action: "proposal.dismiss", id: p.id })}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Rules</h2>
        {state.rules.map((r) => (
          <div key={r.id} className="bg-card space-y-1.5 rounded-2xl border p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.name}</p>
                <p className="text-muted-foreground font-mono text-xs">{r.id}</p>
              </div>
              <Toggle
                on={r.enabled}
                label={`Enable ${r.name}`}
                onChange={(v) => act({ action: "rule.toggle", id: r.id, enabled: v })}
              />
            </div>
            {r.description && <p className="text-sm">{r.description}</p>}
            <p className="text-muted-foreground text-xs">{describeRule(r)}</p>
            <p className="text-xs">
              Fired {r.fired} of {r.evaluations} evaluation{r.evaluations === 1 ? "" : "s"}
              {r.lastRun &&
                ` · last: ${r.lastRun.reason} (${r.lastRun.recordId}, ${time(r.lastRun.at)})`}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

function Activity({
  state,
  act,
}: {
  state: PlatformState;
  act: (b: Record<string, unknown>, msg?: string) => Promise<void>;
}) {
  const open = state.suggestions.filter((s) => s.status === "open");
  const [showSkipped, setShowSkipped] = useState(false);
  const runs = state.runs.filter((r) => showSkipped || r.fired);
  const skipped = state.runs.filter((r) => !r.fired).length;
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Suggestions ({open.length})</h2>
        {open.length === 0 && <p className="text-muted-foreground text-sm">No open suggestions.</p>}
        {open.map((s) => (
          <div key={s.id} className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold">{s.title}</p>
            <p className="text-sm">{s.text}</p>
            <p className="text-muted-foreground text-xs">
              {s.ruleName} · {time(s.at)}
            </p>
            <div className="flex gap-2">
              <Button
                size="lg"
                className="h-11"
                onClick={() =>
                  act(
                    { action: "suggestion.set", id: s.id, status: "accepted" },
                    "Suggestion accepted",
                  )
                }
              >
                Accept
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11"
                onClick={() => act({ action: "suggestion.set", id: s.id, status: "dismissed" })}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Notifications</h2>
          {state.unread > 0 && (
            <Button
              variant="ghost"
              size="lg"
              className="h-10"
              onClick={() => act({ action: "notifications.read" })}
            >
              Mark all read
            </Button>
          )}
        </div>
        {state.notifications.length === 0 && (
          <p className="text-muted-foreground text-sm">No notifications yet.</p>
        )}
        <ul className="space-y-2">
          {state.notifications.map((n) => (
            <li
              key={n.id}
              className={cn("rounded-xl border p-3 text-sm", !n.read && "border-sky-300 bg-sky-50")}
            >
              <p className="font-medium">{n.text}</p>
              <p className="text-muted-foreground text-xs">
                To {n.to.replace("role:", "").replaceAll("_", " ")} ({n.recipients.length}) ·{" "}
                {n.ruleName} · {time(n.at)}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Rule evaluations</h2>
        <ul className="bg-card divide-y rounded-2xl border text-sm">
          {runs.slice(0, 40).map((r) => (
            <li key={r.id} className="flex items-start gap-2 p-3">
              {r.fired ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <CircleSlash className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.ruleName}</span> · {r.recordId} · {r.reason}
                {r.actions.map((a, i) => (
                  <span
                    key={i}
                    className={cn("block text-xs", a.ok ? "text-emerald-800" : "text-red-700")}
                  >
                    {a.type}
                    {a.recordId && ` ${a.recordId}`}
                    {a.detail && `: ${a.detail}`}
                    {a.error && `: ${a.error}`}
                  </span>
                ))}
              </span>
              <span className="text-muted-foreground text-xs">{time(r.at)}</span>
            </li>
          ))}
          {runs.length === 0 && (
            <li className="text-muted-foreground p-3">
              No rule has acted yet. Rules run when records change.
            </li>
          )}
        </ul>
        {skipped > 0 && (
          <Button
            variant="ghost"
            size="lg"
            className="h-10"
            onClick={() => setShowSkipped((v) => !v)}
          >
            {showSkipped
              ? "Hide evaluations that did not act"
              : `Show ${skipped} evaluation${skipped === 1 ? "" : "s"} that did not act`}
          </Button>
        )}
      </section>
    </div>
  );
}

function Policy({
  state,
  act,
}: {
  state: PlatformState;
  act: (b: Record<string, unknown>, msg?: string) => Promise<void>;
}) {
  const levels = ["auto", "approve", "blocked"] as const;
  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-background h-11 rounded-md border px-2 text-base"
    >
      {levels.map((l) => (
        <option key={l} value={l}>
          {l === "auto" ? "Automatic" : l === "approve" ? "Needs approval" : "Blocked"}
        </option>
      ))}
    </select>
  );
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Autonomy</h2>
        <p className="text-muted-foreground text-sm">
          What the agent may write without a person approving it. The gateway enforces this on every
          push.
        </p>
        <ul className="space-y-2">
          {state.policy.autonomy.map((r, i) => (
            <li key={i} className="bg-card flex items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium capitalize">
                  {r.action}
                  {r.server ? ` · ${r.server}` : ""}
                  {r.recordType ? ` · ${r.recordType}` : ""}
                  {r.target ? ` · ${r.target} record` : ""}
                </p>
                {r.note && <p className="text-muted-foreground">{r.note}</p>}
              </div>
              {select(
                r.level,
                (v) => act({ action: "policy.setLevel", index: i, level: v }, "Policy updated"),
                `Autonomy for ${r.action}`,
              )}
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-xl border border-dashed p-3">
            <p className="min-w-0 flex-1 text-sm font-medium">Everything else</p>
            {select(
              state.policy.defaultAutonomy,
              (v) => act({ action: "policy.setDefault", level: v }, "Policy updated"),
              "Default autonomy",
            )}
          </li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Roles and tools</h2>
        <ul className="space-y-1 text-sm">
          {Object.entries(state.policy.roles).map(([role, tools]) => (
            <li key={role}>
              <span className="font-medium">{role.replaceAll("_", " ")}</span>:{" "}
              <span className="font-mono text-xs">{tools.join(", ")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Audit({ state }: { state: PlatformState }) {
  return (
    <ul className="bg-card divide-y rounded-2xl border text-sm">
      {state.audit.length === 0 && (
        <li className="text-muted-foreground p-3">No gateway calls yet.</li>
      )}
      {state.audit.map((e) => (
        <li key={e.id} className="flex items-start gap-2 p-3">
          {e.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="font-mono text-xs font-semibold">{e.tool}</span>
            {e.recordId && <span className="font-mono text-xs"> · {e.recordId}</span>}
            <span className="text-muted-foreground block text-xs">
              {e.actor} via {e.via} · {e.latencyMs} ms{e.changeSetId ? ` · ${e.changeSetId}` : ""}
              {e.error && <span className="text-red-700"> · {e.error}</span>}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">{time(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function RunTraces() {
  const runs = useRuns();
  const [open, setOpen] = useState<string | null>(null);
  if (!runs) return null;
  if (runs.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Run traces appear here after processing scenarios on this device.
      </p>
    );
  return (
    <ul className="space-y-2">
      {runs.map((r) => (
        <li key={r.id} className="bg-card rounded-2xl border">
          <button
            type="button"
            onClick={() => setOpen(open === r.id ? null : r.id)}
            className="flex w-full items-center gap-2 p-3 text-left"
            aria-expanded={open === r.id}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.id}</span>
              <span className="text-muted-foreground text-xs">
                {r.trace.steps.length} steps · {r.trace.steps.filter((s) => s.tool).length} tool
                calls · {r.scenarioIds.length} scenario(s) · {time(r.createdAt)}
              </span>
            </span>
            <ChevronDown
              className={cn("size-4 transition-transform", open === r.id && "rotate-180")}
              aria-hidden
            />
          </button>
          {open === r.id && (
            <ol className="divide-y border-t text-sm">
              {r.trace.steps.map((s) => (
                <li key={s.id} className="flex items-start gap-2 px-3 py-2">
                  <span className="text-muted-foreground w-12 shrink-0 text-xs uppercase">
                    {s.stage}
                  </span>
                  <span className="min-w-0 flex-1">
                    {s.label}
                    {s.tool && (
                      <span className="text-muted-foreground block font-mono text-xs">
                        {s.tool}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">{s.durationMs} ms</span>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}

const METRICS: [keyof EvalReport["metrics"], string][] = [
  ["routingAccuracy", "Routing accuracy"],
  ["actionPrecision", "Action precision"],
  ["actionRecall", "Action recall"],
  ["fieldAccuracy", "Field accuracy"],
  ["unsupportedFields", "Unsupported fields"],
  ["gapPrecision", "Gap question precision"],
  ["gapRecall", "Gap question recall"],
  ["citationRecall", "Citation recall"],
  ["sortPrecision", "Sort suggestion precision"],
  ["duplicateViolations", "Duplicate records"],
  ["workflowAccuracy", "Workflow outcomes"],
  ["pushSuccess", "Push success"],
];

function Evals({
  state,
  act,
  busy,
}: {
  state: PlatformState;
  act: (b: Record<string, unknown>, msg?: string) => Promise<void>;
  busy: boolean;
}) {
  const e = state.evals;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {e
            ? `Last run ${e.at.slice(0, 10)} ${time(e.at)} · ${e.passed}/${e.total} cases fully correct`
            : "No eval results yet."}
        </p>
        <Button
          size="lg"
          className="h-11"
          disabled={busy}
          onClick={() => act({ action: "evals.run" }, "Evals finished")}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          Run evals
        </Button>
      </div>
      {e && (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {METRICS.map(([k, label]) => {
              const m = e.metrics[k];
              const good = typeof m === "number" ? m === 0 : m.value >= 0.999;
              return (
                <div
                  key={k}
                  className={cn("rounded-xl border p-3", good ? "bg-emerald-50" : "bg-amber-50")}
                >
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {typeof m === "number" ? m : pct(m)}
                  </dd>
                  {typeof m !== "number" && (
                    <dd className="text-muted-foreground text-xs tabular-nums">
                      {m.num}/{m.den}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="py-1 font-medium">Case</th>
                <th className="font-medium">Fields</th>
                <th className="font-medium">Actions</th>
                <th className="font-medium">Workflows</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {e.cases.map((c) => {
                const fieldsOk = c.comparison.fields.filter((f) => f.ok).length;
                const wfOk = c.workflows.every((w) => w.expected === w.actual);
                return (
                  <tr key={c.variant}>
                    <td className="py-1.5 font-mono text-xs">{c.variant}</td>
                    <td className="tabular-nums">
                      {fieldsOk}/{c.comparison.fields.length}
                    </td>
                    <td>
                      {c.comparison.missingActions.length + c.comparison.extraActions.length === 0
                        ? "✓"
                        : `${c.comparison.missingActions.length} missing, ${c.comparison.extraActions.length} extra`}
                    </td>
                    <td>{wfOk ? "✓" : "✗"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function PlatformScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "systems";
  const [state, setState] = useState<PlatformState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/platform", { cache: "no-store" })
      .then((r) => r.json() as Promise<PlatformState>)
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch(() => setError("The platform needs a connection."));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(body: Record<string, unknown>, msg?: string) {
    setBusy(true);
    try {
      await post(body);
      if (msg) setNotice(msg);
      load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
          <p className="text-muted-foreground text-sm">
            Connected systems, rules, policy and quality.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          onClick={load}
          aria-label="Refresh"
        >
          <RefreshCw aria-hidden />
        </Button>
      </header>
      <nav aria-label="Platform sections" className="-mx-4 overflow-x-auto px-4">
        <ul role="tablist" className="flex gap-1.5">
          {TABS.map(([id, label]) => (
            <li key={id} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => router.replace(`${pathname}?tab=${id}`, { scroll: false })}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap",
                  tab === id ? "border-foreground bg-foreground text-background" : "bg-background",
                )}
              >
                {label}
                {id === "activity" && (state?.unread ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-600 px-1.5 text-xs text-white">
                    <Bell className="size-3" aria-hidden />
                    {state!.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {notice && (
        <p role="status" className="bg-muted rounded-xl px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      {error && <p className="text-amber-800">{error}</p>}
      {!state && !error && <p className="text-muted-foreground py-10 text-center">Loading…</p>}
      {state && tab === "systems" && <Systems state={state} act={act} />}
      {state && tab === "workflows" && <Workflows state={state} act={act} />}
      {state && tab === "activity" && <Activity state={state} act={act} />}
      {state && tab === "policy" && <Policy state={state} act={act} />}
      {state && tab === "audit" && <Audit state={state} />}
      {tab === "runs" && <RunTraces />}
      {state && tab === "evals" && <Evals state={state} act={act} busy={busy} />}
    </div>
  );
}
