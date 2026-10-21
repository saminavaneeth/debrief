/**
 * Run one mock EHS server over stdio, for MCP Inspector, Claude Desktop or IDE clients:
 *
 *   npm run mcp -- incidents
 *   npm run mcp -- hazards --persist
 *
 * Starts from the latest app snapshot (`.data/store.json`) or the seed. Writes stay in this
 * process unless `--persist` is given (do not use `--persist` while `npm run dev` is running;
 * both processes would rewrite the same snapshot).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRuntime } from "@/mcp/runtime";
import { isServerId, SERVER_FACTORIES } from "@/mcp/servers";

async function main() {
  const [id, ...flags] = process.argv.slice(2);
  if (!id || !isServerId(id)) {
    console.error(`Usage: npm run mcp -- <${Object.keys(SERVER_FACTORIES).join("|")}> [--persist]`);
    process.exit(1);
  }
  const persist = flags.includes("--persist");
  const runtime = createRuntime({ readOnlySnapshot: !persist });
  const server = SERVER_FACTORIES[id](runtime.serverDeps);
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; diagnostics go to stderr.
  console.error(`debrief-${id} MCP server on stdio${persist ? " (persisting to .data/)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
