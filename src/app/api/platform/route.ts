import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { z } from "zod";
import { Autonomy, ServerId } from "@/domain";
import { getRuntime } from "@/mcp/runtime";
import { MODULES } from "@/mcp/servers";
import { runEvals } from "@/evals/run-evals";
import { detectPatterns } from "@/workflows/proposals";

const RESULTS_DIR = path.join(process.cwd(), "evals", "results");

function latestEvals() {
  const file = path.join(RESULTS_DIR, "latest.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * Platform state for the admin screen: connected systems and their tools, autonomy policy,
 * workflow rules and proposals, the workflow feed, the audit log and the latest eval results.
 * `?view=summary` returns only the unread count; `?changeSet=<id>` the workflow activity of one
 * push.
 */
export async function GET(req: Request) {
  await connection();
  const rt = getRuntime();
  const params = new URL(req.url).searchParams;
  const unread = rt.feed.notifications.filter((n) => !n.read).length;
  if (params.get("view") === "summary") {
    return Response.json({
      unread,
      openSuggestions: rt.feed.suggestions.filter((s) => s.status === "open").length,
    });
  }
  const changeSet = params.get("changeSet");
  if (changeSet) {
    return Response.json({
      runs: rt.feed.runs.filter((r) => r.changeSetId === changeSet),
      notifications: rt.feed.notifications.filter((n) => n.changeSetId === changeSet),
      suggestions: rt.feed.suggestions.filter((s) => s.changeSetId === changeSet),
    });
  }

  const records = await rt.store.list();
  const discovered = new Map((await rt.gateway.discovery.servers()).map((s) => [s.id, s]));
  const servers = rt.registry.list().map((entry) => {
    const d = discovered.get(entry.id);
    const manifest = d?.manifest ?? MODULES[entry.id].manifest;
    return {
      id: entry.id,
      enabled: entry.enabled,
      transport: entry.transport.type,
      displayName: manifest.displayName,
      description: manifest.description,
      recordTypes: manifest.recordTypes.map((t) => ({
        recordType: t.recordType,
        displayName: t.displayName,
        idPrefix: t.idPrefix,
        keywords: t.routing.keywords.slice(0, 8),
        useWhen: t.routing.useWhen,
      })),
      tools: d?.tools.map((t) => ({ name: t.name, description: t.description })) ?? [],
      recordCount: records.filter((r) => r.server === entry.id).length,
    };
  });
  const rules = rt.workflows.list().map((r) => {
    const runs = rt.feed.runs.filter((x) => x.ruleId === r.id);
    return {
      ...r,
      evaluations: runs.length,
      fired: runs.filter((x) => x.fired).length,
      lastRun: runs[0] ?? null,
    };
  });
  return Response.json({
    servers,
    policy: rt.policy.rules,
    rules,
    proposals: rt.proposals,
    notifications: rt.feed.notifications.slice(0, 100),
    suggestions: rt.feed.suggestions.slice(0, 100),
    runs: rt.feed.runs.slice(0, 150),
    audit: rt.audit.list({ limit: 200 }),
    evals: latestEvals(),
    unread,
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("server.toggle"), id: ServerId, enabled: z.boolean() }),
  z.object({
    action: z.literal("policy.setLevel"),
    index: z.number().int().nonnegative(),
    level: Autonomy,
  }),
  z.object({ action: z.literal("policy.setDefault"), level: Autonomy }),
  z.object({ action: z.literal("rule.toggle"), id: z.string(), enabled: z.boolean() }),
  z.object({ action: z.literal("proposals.scan") }),
  z.object({ action: z.literal("proposal.enable"), id: z.string() }),
  z.object({ action: z.literal("proposal.dismiss"), id: z.string() }),
  z.object({
    action: z.literal("suggestion.set"),
    id: z.string(),
    status: z.enum(["open", "accepted", "dismissed"]),
  }),
  z.object({ action: z.literal("notifications.read") }),
  z.object({ action: z.literal("evals.run") }),
]);

export async function POST(req: Request) {
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const rt = getRuntime();
  const a = parsed.data;
  switch (a.action) {
    case "server.toggle":
      rt.registry.setEnabled(a.id, a.enabled);
      break;
    case "policy.setLevel": {
      const p = rt.policy.rules;
      if (!p.autonomy[a.index]) return Response.json({ error: "No such rule" }, { status: 404 });
      p.autonomy[a.index].level = a.level;
      rt.policy.update(p);
      break;
    }
    case "policy.setDefault": {
      const p = rt.policy.rules;
      p.defaultAutonomy = a.level;
      rt.policy.update(p);
      break;
    }
    case "rule.toggle":
      rt.workflows.setEnabled(a.id, a.enabled);
      break;
    case "proposals.scan": {
      const existing = new Set([
        ...rt.workflows.list().map((r) => r.id),
        ...rt.proposals.map((p) => p.id),
      ]);
      const found = await detectPatterns(rt.gateway, rt.org, rt.clock, existing);
      rt.proposals.unshift(...found);
      return Response.json({ added: found.length });
    }
    case "proposal.enable": {
      const p = rt.proposals.find((x) => x.id === a.id);
      if (!p) return Response.json({ error: "No such proposal" }, { status: 404 });
      rt.workflows.add({ ...p.rule, enabled: true });
      p.status = "enabled";
      break;
    }
    case "proposal.dismiss": {
      const p = rt.proposals.find((x) => x.id === a.id);
      if (p) p.status = "dismissed";
      break;
    }
    case "suggestion.set":
      rt.feed.setSuggestion(a.id, a.status);
      break;
    case "notifications.read":
      rt.feed.markAllRead();
      break;
    case "evals.run": {
      const report = await runEvals();
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(RESULTS_DIR, "latest.json"), JSON.stringify(report, null, 2));
      return Response.json({ passed: report.passed, total: report.total });
    }
  }
  return Response.json({ ok: true });
}
