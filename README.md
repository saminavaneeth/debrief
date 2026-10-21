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

| Command             | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Start the app                               |
| `npm run build`     | Production build                            |
| `npm test`          | Unit tests and data validation (Vitest)     |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm run lint`      | ESLint                                      |
| `npm run format`    | Prettier                                    |

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
tests/       data validation tests
```
