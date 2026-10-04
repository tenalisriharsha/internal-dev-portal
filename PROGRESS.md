# Progress

## Vision

`internal-dev-portal` is a lightweight, Backstage-style internal developer
platform. It gives an engineering org a single place to answer:

- **What services exist, and who owns them?** — a service catalog built from a
  `catalog-info.yaml` file living in each repo, not a wiki page that goes stale.
- **Who do I page at 2am?** — ownership and on-call metadata (provider,
  rotation, Slack channel) attached to every service.
- **What breaks if I change this?** — a dependency graph between services,
  derived automatically from declared `dependsOn` relationships.
- **How do I start a new service the right way?** — a self-service "create new
  service" flow that scaffolds a golden-path template instead of a blank repo.

The bet is the same one Backstage makes at a much larger scale: if the catalog
is generated from metadata that lives next to the code, it stays accurate for
free. This project reimplements the useful slice of that idea with a small,
readable codebase.

## Architecture

A TypeScript npm-workspaces monorepo, two packages:

```
internal-dev-portal/
  packages/
    core/   @idp/core  — catalog schema, YAML loader, dependency graph, template engine
    web/    @idp/web   — Express server: catalog UI, service detail, graph view, create flow
  catalog/examples/     — example catalog-info.yaml fixtures (stand-ins for "other repos")
  templates/golden-path-service/  — the scaffold the self-service flow renders
  generated/            — where self-service "create new service" writes new services
```

**`@idp/core`** is the domain layer, framework-free and fully unit-tested:

- `schema.ts` — a Zod schema for `catalog-info.yaml` (metadata, ownership,
  lifecycle, on-call, dependencies).
- `catalog.ts` — scans one or more root directories for
  `<service>/catalog-info.yaml`, validates each against the schema, and
  collects both the valid entries and any validation errors (a malformed file
  never crashes the whole catalog load).
- `graph.ts` — builds a nodes/edges dependency graph from the catalog, detects
  cycles (DFS), and can topologically sort services.
- `template.ts` — renders a directory of `*.tmpl` files with `{{variable}}`
  substitution into a fresh output directory, refusing to overwrite an
  existing one.

**`@idp/web`** is a server-rendered Express app (no client-side framework,
no build step beyond `ts-node`) with four views:

- `/` — the service catalog, cards with lifecycle/kind badges and ownership.
- `/services/:name` — ownership, on-call rotation, and both directions of the
  dependency relationship (what it depends on, what depends on it).
- `/graph` — the full dependency graph as a hand-laid-out SVG, nodes colored
  by lifecycle status.
- `/create` — a form that scaffolds a brand-new service from
  `templates/golden-path-service` straight into `generated/`, which the
  catalog picks up immediately.

The catalog is reloaded from disk on every request rather than cached, which
keeps the self-service flow honest: create a service, and it is simply *in*
the catalog on the next page load — no cache invalidation logic to get wrong.

## Phased build plan

- [x] **Phase 1 — Scaffold & core foundation** *(tonight)*
  - [x] npm workspaces monorepo scaffold (`@idp/core`, `@idp/web`)
  - [x] Catalog schema + YAML loader with validation error reporting
  - [x] Dependency graph builder, cycle detection, topological sort
  - [x] Golden-path template engine (variable substitution, no-overwrite guard)
  - [x] Example catalog data (6 services) modeling a realistic small org
  - [x] Server-rendered web UI: catalog list, service detail, dependency graph, create flow
  - [x] Unit tests for every core module (25 tests) and integration tests for every web route (12 tests)
  - [x] All 37 tests passing; both packages type-check clean
  - [x] 7 verified screenshots covering every distinct view/state

- [ ] **Phase 2 — Persistence & real-world ingestion**
  - [ ] Replace in-repo `catalog/examples` with a configurable list of real
        GitHub repos; fetch `catalog-info.yaml` from each via the GitHub API
        on a schedule instead of reading local fixtures
  - [ ] Swap "reload catalog on every request" for a persisted store (SQLite)
        with an explicit refresh/webhook trigger
  - [ ] Catalog YAML validation surfaced in the UI (currently only in
        `catalog.errors`, not rendered anywhere)

- [ ] **Phase 3 — Ownership & on-call depth**
  - [ ] Team pages (all services owned by a team, aggregated on-call)
  - [ ] On-call escalation links that resolve to a real PagerDuty/Opsgenie
        schedule rather than free-text rotation names
  - [ ] Service health/status signal (e.g. last-deploy time, open incident count)

- [ ] **Phase 4 — Golden paths, plural**
  - [ ] More than one template (`golden-path-service`, `golden-path-website`,
        `golden-path-library`), selectable in the create flow
  - [ ] Template variables beyond string substitution (conditional blocks,
        loops) if a real template needs them
  - [ ] Optional: scaffold directly into a new GitHub repo via the GitHub API
        instead of only into `generated/`

- [ ] **Phase 5 — Polish & deploy**
  - [ ] Authentication (even a simple shared-secret gate) before this is
        exposed beyond localhost
  - [ ] Deployed demo instance + CI (lint, typecheck, test on every push)
  - [ ] Search/filter on the catalog list; sort/group by owner or lifecycle

## Where to resume (next session)

Start **Phase 2**. The concrete first step: design the "repo source"
abstraction in `@idp/core` — right now `Catalog.loadFromDirectories` only
understands local directories; Phase 2 needs a second implementation that
fetches `catalog-info.yaml` from a list of GitHub repos via the API (with the
local-directory loader kept as-is for tests and the example fixtures). Land
that behind the same `Catalog` interface so `@idp/web` doesn't need to change
at all — that's the test of whether the Phase 1 abstraction boundary was drawn
in the right place.

STATUS: IN_PROGRESS
