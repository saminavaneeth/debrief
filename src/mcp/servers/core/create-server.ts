import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ModuleDefinition } from "./module";
import {
  AttachArgs,
  CreateArgs,
  GetArgs,
  LinkArgs,
  ModuleService,
  SearchArgs,
  type ServerDeps,
  ToolError,
  UpdateArgs,
  ValidateArgs,
} from "./service";

function ok(value: unknown): CallToolResult {
  const structured = (value ?? {}) as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: structured,
  };
}

function fail(err: unknown): CallToolResult {
  if (err instanceof ToolError) {
    const body = { error: err.message, fieldErrors: err.fieldErrors };
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      structuredContent: body,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    structuredContent: { error: message, fieldErrors: [] },
  };
}

const run = (fn: () => Promise<unknown>) => fn().then(ok, fail);

const json = (uri: string, value: unknown) => ({
  contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }],
});

/**
 * One mock EHS system as an MCP server: the uniform tool contract plus manifest, schema and
 * picklist resources. Every server in `src/mcp/servers/modules` is built from this.
 */
export function createEhsServer(def: ModuleDefinition, deps: ServerDeps): McpServer {
  const service = new ModuleService(def, deps);
  const { server: id, displayName } = def.manifest;
  const types = def.manifest.recordTypes.map((t) => t.recordType).join(", ");

  const server = new McpServer(
    { name: `debrief-${id}`, title: `${displayName} (mock)`, version: def.manifest.version },
    {
      instructions: `${def.manifest.description} Record types: ${types}. Read ehs://${id}/manifest first.`,
    },
  );

  server.registerTool(
    "search_records",
    {
      title: "Search records",
      description: `Hybrid keyword search with filters over ${displayName} records (${types}).`,
      inputSchema: SearchArgs,
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => service.search(args)),
  );

  server.registerTool(
    "get_record",
    {
      title: "Get record",
      description: "Full record including links, evidence, corrective actions and history.",
      inputSchema: GetArgs,
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => service.get(args)),
  );

  server.registerTool(
    "create_record",
    {
      title: "Create record",
      description: `Create a record from a payload matching ehs://${id}/schema/{recordType}. The server assigns id, timestamps and history.`,
      inputSchema: CreateArgs,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    (args) => run(() => service.create(args)),
  );

  server.registerTool(
    "update_record",
    {
      title: "Update record",
      description:
        "Apply patch ops (set, append, remove). Paths use dots and [id] selectors, e.g. items[FE-115].response or correctiveActions.",
      inputSchema: UpdateArgs,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    (args) => run(() => service.update(args)),
  );

  server.registerTool(
    "attach_evidence",
    {
      title: "Attach evidence",
      description:
        "Attach a captured artifact (photo, video, document, voice, note) with provenance.",
      inputSchema: AttachArgs,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    (args) => run(() => service.attach(args)),
  );

  server.registerTool(
    "link_records",
    {
      title: "Link records",
      description:
        "Add a link from a record on this server to any record (relatedTo, causedBy, resultedIn, foundDuring). Writes this side only.",
      inputSchema: LinkArgs,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    (args) => run(() => service.link(args)),
  );

  server.registerTool(
    "validate_record",
    {
      title: "Validate record",
      description:
        "Dry-run a create payload or an update patch; returns field errors and a preview.",
      inputSchema: ValidateArgs,
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => service.validate(args)),
  );

  server.registerResource(
    "manifest",
    `ehs://${id}/manifest`,
    {
      title: `${displayName} manifest`,
      description: "Record types, routing hints, matching hints, link types.",
      mimeType: "application/json",
    },
    (uri) => json(uri.href, def.manifest),
  );

  server.registerResource(
    "schema",
    new ResourceTemplate(`ehs://${id}/schema/{recordType}`, {
      list: () => ({
        resources: def.manifest.recordTypes.map((t) => ({
          uri: `ehs://${id}/schema/${t.recordType}`,
          name: `${t.recordType} schema`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Record JSON Schema",
      description: "Create-payload JSON Schema with x-* extraction metadata.",
      mimeType: "application/json",
    },
    (uri, vars) => json(uri.href, service.jsonSchema(String(vars.recordType))),
  );

  server.registerResource(
    "picklists",
    `ehs://${id}/picklists`,
    {
      title: `${displayName} picklists`,
      description: "Shared enumerations: severity, risk, categories, statuses.",
      mimeType: "application/json",
    },
    (uri) => json(uri.href, service.picklists()),
  );

  return server;
}
