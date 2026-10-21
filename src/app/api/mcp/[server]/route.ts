import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getRuntime } from "@/mcp/runtime";
import { isServerId, SERVER_FACTORIES } from "@/mcp/servers";

/**
 * Streamable HTTP endpoint for one mock EHS server, e.g. `/api/mcp/incidents`. Stateless: each
 * request gets a fresh server instance over the shared store, so any MCP client (MCP Inspector,
 * IDEs) can connect to the same systems the app uses.
 */
async function handle(req: Request, ctx: RouteContext<"/api/mcp/[server]">): Promise<Response> {
  const { server } = await ctx.params;
  if (!isServerId(server)) {
    return Response.json({ error: `Unknown server "${server}"` }, { status: 404 });
  }
  const mcp = SERVER_FACTORIES[server](getRuntime().serverDeps);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await mcp.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
