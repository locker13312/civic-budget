# civic-budget

A participatory budgeting system for a city. Residents submit projects, city moderators review them,
residents vote, and the system picks the winners within each category's budget and tracks how they
are delivered.

A semester-long university project for the "JavaScript Development" course: every assignment grows the
same codebase. Ukrainian version: [README.md](README.md).

## Why this domain

Participatory budgeting has real rules that are easy to break: round phases, cost limits, one vote per
project, choosing winners within a budget. That gives plenty to specify, test and defend. Kyiv, Lviv and
Vinnytsia run such programs, so the rules come from real practice.

## Engineering highlights

- **Modular monolith** on Node.js and Fastify, module boundaries enforced by dependency-cruiser
- **PostgreSQL 16** in Docker, plain SQL migrations
- **Test pyramid:** unit, integration (API, database, git hooks, smoke) and end-to-end tests
- **Coverage thresholds:** 100% lines and branches for the domain layer, 80% branches overall
- **Mutation testing** with Stryker, the build fails below a 70% mutation score
- **CI on Linux and Windows:** formatting, lint, module boundaries, types (JSDoc + TypeScript), unused
  dependencies, document checks, tests, build
- **Architecture decisions** recorded as ADRs in [adr/](adr/)
- **Git hooks** run the same checks before commit and push

## Quick start

Requires Node.js 22+ and git.

```bash
npm ci                 # dependencies and git hooks
npm run start:static   # prototype on static data, no database needed
npm run db:up          # PostgreSQL 16 in Docker on 127.0.0.1:55432
npm run db:seed        # schema and seed data
npm start              # API on PostgreSQL: http://127.0.0.1:3000/cycles
npm run check          # every check: format, lint, boundaries, types, deps, docs, tests, build
```

Tests by level: `npm run test:unit`, `npm run test:integration` (needs PostgreSQL), `npm run test:e2e`.
Coverage with thresholds: `npm run coverage`. Mutation testing: `npm run mutation`.

## Repository map

| Path                     | Contents                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| [spec.md](spec.md)       | system specification: modules, data model, scenarios, boundaries  |
| [standards/](standards/) | project standards: spec format, ADR, definition of done, checks   |
| [adr/](adr/)             | architecture decision records (MADR)                              |
| `migrations/`            | PostgreSQL schema                                                 |
| `src/`                   | code, one folder per module                                       |
| `test/`                  | tests by level: `unit/`, `api/`, `db/`, `hooks/`, `smoke/`, `e2e/` |
| `tasks/`                 | assignment deliverables: specs, audits, test reports              |
