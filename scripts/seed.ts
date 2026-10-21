/** Rebuild `.data/store.json` from `data/seed` (the same as "Reset demo"). */
import { createRuntime, resetDemo, SNAPSHOT_PATH } from "@/mcp/runtime";

async function main() {
  const runtime = createRuntime();
  await resetDemo(runtime);
  const count = (await runtime.store.list()).length;
  console.log(`Seeded ${count} records into ${SNAPSHOT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
