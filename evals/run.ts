/**
 * npm run eval — run S1–S6 and their paraphrase variants through the demo engine, push, and
 * score against fixtures/expected. Writes evals/results/<timestamp>.json and latest.json.
 */
import fs from "node:fs";
import path from "node:path";
import { METRIC_LABELS, type Ratio, runEvals } from "@/evals/run-evals";
import { formatComparison } from "@/evals/compare";

async function main() {
  const report = await runEvals((c) => {
    const wf = c.workflows.every((w) => w.expected === w.actual);
    const ok = c.comparison.ok && wf && c.push.executed === c.push.total;
    console.log(`${ok ? "✓" : "✗"} ${c.variant.padEnd(6)} ${String(c.durationMs).padStart(5)} ms`);
    if (!c.comparison.ok) console.log(formatComparison(c.comparison).replace(/^/gm, "    "));
    for (const w of c.workflows.filter((x) => x.expected !== x.actual)) {
      console.log(
        `    workflow ${w.ruleId}: expected ${w.expected ? "to fire" : "not to fire"}, ${w.actual ? "fired" : "did not fire"}`,
      );
    }
  });

  console.log(`\n${report.passed}/${report.total} cases fully correct\n`);
  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const m = report.metrics[key as keyof typeof report.metrics];
    const text =
      typeof m === "number"
        ? String(m)
        : `${((m as Ratio).value * 100).toFixed(1)}%  (${(m as Ratio).num}/${(m as Ratio).den})`;
    console.log(`  ${label.padEnd(32)} ${text}`);
  }

  const dir = path.join(process.cwd(), "evals", "results");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = report.at.slice(0, 19).replaceAll(":", "-");
  fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(report, null, 2));
  console.log(`\nWrote evals/results/${stamp}.json`);
  if (report.passed !== report.total) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
