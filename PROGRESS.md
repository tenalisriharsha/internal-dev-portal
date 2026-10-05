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
    core/   @idp/core  — schema, sources (local dir + GitHub), SQLite store, scheduler, graph, template engine
    web/    @idp/web   — Express server: catalog UI, service detail, graph view, create flow, admin refresh
  catalog/examples/     — example catalog-info.yaml fixtures (stand-ins for "other repos")
  templates/golden-path-service/  — the scaffold the self-service flow renders
  generated/            — where self-service "create new service" writes new services
  catalog.db            — (gitignored) persisted catalog snapshot, created on first run
```

**`@idp/core`** is the domain layer, framework-free and fully unit-tested:

- `schema.ts` — a Zod schema for `catalog-info.yaml` (metadata, ownership,
  lifecycle, on-call, dependencies).
- `source.ts` — the `CatalogSource` abstraction: `LocalDirectorySource` scans
  a root directory for `<service>/catalog-info.yaml`; `GitHubRepoSource`
  fetches the same file from a configured list of GitHub repos via the
  Contents API (raw-media-type `Accept` header, injectable `fetchFn` so tests
  never touch the network). Both return raw `{id, contents}` pairs; neither
  knows about YAML or the schema.
- `catalog.ts` — `Catalog.load(sources)` pulls raw files from any mix of
  sources, parses and validates each against the schema, and collects both
  the valid entries and any validation errors (a malformed file never crashes
  the whole load). `Catalog.loadFromDirectories` is a thin convenience
  wrapper over `load` for local-only callers (tests, fixtures).
  `Catalog.fromSnapshot`/`toSnapshot` move a catalog to and from the
  persisted form `CatalogStore` reads and writes.
- `store.ts` — `CatalogStore`, a SQLite-backed (`node:sqlite`, no extra
  dependency) persisted snapshot: `services`, `catalog_errors`, and `meta`
  tables. `refresh(sources)` re-loads from sources and overwrites the
  snapshot transactionally; `snapshot()` only ever reads what's already
  persisted — it never touches a source. This is the explicit refresh
  boundary: nothing reloads the catalog as a side effect of a page view.
- `scheduler.ts` — `startScheduledRefresh(store, sources, intervalMs)` calls
  `store.refresh` on a fixed interval (injectable timers, tested with
  `vi.useFakeTimers`) and returns a stop function.
- `graph.ts` — builds a nodes/edges dependency graph from the catalog, detects
  cycles (DFS), and can topologically sort services.
- `template.ts` — renders a directory of `*.tmpl` files with `{{variable}}`
  substitution into a fresh output directory, refusing to overwrite an
  existing one.

**`@idp/web`** is a server-rendered Express app (no client-side framework,
no build step beyond `ts-node`) with four pages plus one action route:

- `/` — the service catalog, cards with lifecycle/kind badges and ownership,
  a "last refreshed" timestamp, a manual "Refresh now" button, and a banner
  listing any catalog-info.yaml files that failed validation.
- `/services/:name` — ownership, on-call rotation, and both directions of the
  dependency relationship (what it depends on, what depends on it).
- `/graph` — the full dependency graph as a hand-laid-out SVG, nodes colored
  by lifecycle status.
- `/create` — a form that scaffolds a brand-new service from
  `templates/golden-path-service` straight into `generated/`, then calls
  `store.refresh` so it's in the catalog on the very next page load.
- `POST /admin/refresh` — re-runs `store.refresh(sources)` and redirects back
  (defaults to `/`, accepts a same-origin-only `redirectTo`). This is the
  button's target today; a repo webhook could POST to the same URL once
  Phase 5 adds auth in front of it.

Every page read is now `store.snapshot()` — a SQLite read — rehydrated into a
`Catalog` via `Catalog.fromSnapshot`. The catalog only changes when something
calls `refresh` explicitly: the startup refresh in `index.ts`, the interval
scheduler, the admin route, or the create flow. `@idp/web`'s route and view
code didn't need to change shape at all (`catalog.list()`, `.get()`,
`.getDependents()`, `.sourceFileFor()` are identical pre- and post-Phase-2) —
only *where the Catalog instance comes from* changed, which was the point of
drawing the `CatalogSource`/`Catalog` boundary where Phase 1 did.

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

- [x] **Phase 2 — Persistence & real-world ingestion** *(tonight)*
  - [x] `CatalogSource` abstraction (`LocalDirectorySource`,
        `GitHubRepoSource`) behind the same `Catalog.load` entry point
  - [x] `GitHubRepoSource` fetches `catalog-info.yaml` from a configurable
        list of GitHub repos (`CATALOG_GITHUB_REPOS` env var, optional
        `GITHUB_TOKEN`), additive alongside the local fixtures rather than a
        hard replacement — there's no real org to point this demo at, so
        `catalog/examples` stays as the always-on default source and GitHub
        repos layer on top when configured
  - [x] Swapped "reload catalog on every request" for a SQLite-backed
        `CatalogStore`; reads are persisted-snapshot reads, writes only
        happen via explicit `refresh()` (startup, interval scheduler,
        `POST /admin/refresh`, or after the create flow scaffolds a service)
  - [x] `startScheduledRefresh` reloads the store on an interval
        (`CATALOG_REFRESH_INTERVAL_MS`, default 5 minutes, 0 disables it)
  - [x] Catalog YAML validation errors surfaced in the UI as a banner on `/`,
        with GitHub-repo ids and relative file paths both readable
  - [x] 22 new tests (GitHub source with injected fetch, SQLite store,
        fake-timer scheduler, admin refresh route, persisted-vs-stale
        read behavior) — 59 tests total, all passing; both packages
        type-check clean
  - [x] 2 screenshots recaptured (refreshed-timestamp + refresh button are
        now part of the catalog list chrome) and 1 new screenshot added for
        the validation-error banner — 8 screenshots total, all verified

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

Start **Phase 3 — Ownership & on-call depth**. The concrete first step: team
pages. `CatalogEntry.spec.owner` is already a plain string on every entry, so
a `/teams/:owner` route can be built the same way `/services/:name` was —
filter `catalog.list()` by owner, no new core abstraction needed yet. The
`oncall` block (provider/rotation/slack) is already modeled in the schema but
only rendered per-service; aggregating it per-team on that new page is the
natural next increment. Escalation links that resolve to a real
PagerDuty/Opsgenie schedule (rather than the free-text `rotation` string) are
a reasonable stretch goal for the same phase but need a decision on which
provider's API to integrate first — defer until team pages exist and it's
clear what data a real schedule lookup needs to key on.

STATUS: IN_PROGRESS
