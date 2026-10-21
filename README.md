# Debrief

Debrief is a mobile-first web app that turns what a safety professional captures in the field —
voice, photos, video, documents and notes — into the correct, linked records across connected EHS
applications. The agent proposes a change set; the user reviews and approves it before anything is
written.

It runs entirely locally in **demo mode**: perception comes from fixtures, while routing, matching,
drafting, gap-finding, planning, MCP calls and workflows run as real code.

## Requirements

- Node.js 20 or newer
- Chrome or Edge (for speech recognition during capture)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

## Scripts

| Command                   | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run dev`             | Start the app                                                    |
| `npm run build`           | Production build                                                 |
| `npm test`                | Unit tests and data validation (Vitest)                          |
| `npm run typecheck`       | Generate route types and run `tsc --noEmit`                      |
| `npm run lint`            | ESLint                                                           |
| `npm run format`          | Prettier                                                         |
| `npm run seed`            | Rebuild `.data/store.json` from `data/seed` (same as Reset demo) |
| `npm run mcp -- <server>` | Run one mock EHS server over stdio                               |

## Mock EHS systems

Five mock EHS applications run as MCP servers — `incidents`, `audits`, `meetings`, `hazards`,
`inspections` — plus `training`, which starts disconnected from the gateway. Their records are
visible at [http://localhost:3000/console](http://localhost:3000/console).

Each server can be reached by any MCP client:

- **Streamable HTTP** (while `npm run dev` is running): `http://localhost:3000/api/mcp/<server>`
- **stdio**: `npm run --silent mcp -- <server>` (or `npx tsx scripts/mcp.ts <server>`). It starts
  from the app's latest state and keeps its writes to itself unless `--persist` is passed.

```bash
# MCP Inspector (UI)
npx @modelcontextprotocol/inspector npx tsx scripts/mcp.ts hazards

# MCP Inspector (CLI) against the running app
npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp/hazards --transport http --method tools/list
```

Claude Desktop (`claude_desktop_config.json`), with `cwd` set to this repository:

```json
{
  "mcpServers": {
    "debrief-hazards": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp.ts", "hazards"],
      "cwd": "/path/to/debrief"
    }
  }
}
```

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decision log](docs/DECISIONS.md)

## Repository layout

```
data/        seed organization and records, knowledge docs, workflow rules
fixtures/    demo scenarios S1–S6 (artifacts, perception, variants) and expected change sets
src/app/     routes
src/domain/  types and Zod schemas shared by every layer
src/lib/     shared helpers
src/mcp/     mock EHS servers, store and gateway
scripts/     seed and stdio launcher
tests/       data validation, server, gateway and route tests
mcp.config.json  connected servers and their transports
```
