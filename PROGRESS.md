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
  templates/golden-path-service/  — golden path for kind: Service
  templates/golden-path-website/  — golden path for kind: Website
  templates/golden-path-library/  — golden path for kind: Library
  generated/            — where self-service "create new service" writes new services
  catalog.db            — (gitignored) persisted catalog snapshot, created on first run
```

**`@idp/core`** is the domain layer, framework-free and fully unit-tested:

- `schema.ts` — a Zod schema for `catalog-info.yaml` (metadata, ownership,
  lifecycle, on-call, dependencies, and an optional `health` block —
  `lastDeployAt` plus `openIncidents`, defaulting `openIncidents` to 0).
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
  existing one. Unchanged since Phase 1: Phase 4 added a second and third
  template directory, not a second rendering engine — `renderTemplate` has no
  idea there's more than one golden path.

**`@idp/web`** is a server-rendered Express app (no client-side framework,
no build step beyond `ts-node`) with four pages plus one action route:

- `/` — the service catalog, cards with lifecycle/kind badges and ownership,
  a "last refreshed" timestamp, a manual "Refresh now" button, a banner
  listing any catalog-info.yaml files that failed validation, and a filter
  bar (`?q=`/`?kind=`/`?lifecycle=`) over the loaded entries.
- `/services/:name` — ownership, on-call rotation, a health panel
  (open-incident badge plus last-deploy time, or an empty state when the
  entry has no `health` block), and both directions of the dependency
  relationship (what it depends on, what depends on it).
- `/teams` — every distinct `spec.owner` value in the catalog as a team card:
  service count, a health badge summing that team's open incidents, and how
  many distinct on-call rotations back it. There's no separate "team"
  concept in the schema — a team is just whatever string services declare as
  their owner, grouped at render time.
- `/teams/:owner` — every service that team owns, its combined on-call
  rotations (deduped by provider+rotation), and a health rollup (total open
  incidents, most recent deploy across the team's services). 404s when no
  service declares that owner.
- `/graph` — the full dependency graph as a hand-laid-out SVG, nodes colored
  by lifecycle status.
- `/create` — a form that scaffolds a brand-new service, website, or library
  (a "Kind" field picks which golden-path template to render) straight into
  `generated/`, then calls `store.refresh` so it's in the catalog on the
  very next page load.
- `POST /admin/refresh` — re-runs `store.refresh(sources)` and redirects back
  (defaults to `/`, accepts a same-origin-only `redirectTo`). This is the
  button's target today; a repo webhook could POST to the same URL. Gated
  behind `requireAdminToken` (`ADMIN_TOKEN` env var, HTTP Basic auth) when
  configured, same as the whole `/create` router.

On-call rotation names (wherever they're rendered — service detail or a
team page) go through `oncallLinks.escalationUrl`, which builds a deep link
into the provider's schedule search *only* when the matching env var is
set (`PAGERDUTY_SUBDOMAIN` or `OPSGENIE_ORG`); otherwise the rotation
renders as plain text, same as before this existed. This is a URL-pattern
deep link, not a live API call — there's no real PagerDuty/Opsgenie account
behind this demo to verify against, so it intentionally stops at "jump to
a search for this rotation name" rather than resolving a specific schedule.

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

- [x] **Phase 3 — Ownership & on-call depth** *(tonight)*
  - [x] `/teams` and `/teams/:owner` pages grouping `catalog.list()` by
        `spec.owner` at render time — no new "team" entity in the schema,
        matching the plan to defer that abstraction until it's needed
  - [x] Team pages aggregate on-call rotations (deduped by
        provider+rotation) and roll up open incidents / most recent deploy
        across every service the team owns
  - [x] On-call escalation links: an optional `EscalationConfig`
        (`PAGERDUTY_SUBDOMAIN` / `OPSGENIE_ORG` env vars) turns a rotation
        name into a deep link to that provider's schedule search; without
        config it stays plain text, so this is additive, not a breaking
        change to existing on-call rendering
  - [x] `spec.health` schema addition (`lastDeployAt`, `openIncidents`,
        both optional/defaulted) — a health panel on `/services/:name`
        shows a color-coded open-incident badge and last-deploy time, or an
        empty state when a service reports no health data at all
        (`notifications-service` in the fixtures intentionally has none, to
        exercise that path)
  - [x] 19 new tests (health schema validation, `escalationUrl` unit tests,
        team routes, service-detail health panel, escalation link
        rendering with and without config) — 78 tests total, all passing;
        both packages type-check clean
  - [x] 3 new screenshots (teams list, team detail, service detail with
        health panel + linked rotation) — 11 screenshots total, all
        verified

- [x] **Phase 4 — Golden paths, plural** *(tonight)*
  - [x] Three golden-path templates (`golden-path-service`,
        `golden-path-website`, `golden-path-library`), each a real
        `kind`-specific scaffold: the website template renders a static
        `src/index.html` with a `serve`-based `dev` script, the library
        template renders a `tsc`-buildable `src/index.ts` with no `dev`
        script (libraries don't run), matching how each kind actually gets
        used rather than reusing the service template with the `kind` field
        swapped
  - [x] `options.templateDir` (one path) became `options.templateDirs`
        (a `Record<CatalogEntry["kind"], string>`); a "Kind" `<select>` in
        the create form drives which entry `routes/create.ts` renders from,
        and which `kind` gets written into the generated `catalog-info.yaml`
  - [x] `template.ts`'s render function needed no changes at all — adding a
        template was adding a directory and a map entry, not touching the
        engine, exactly as scoped last session
  - [x] Deferred (unchanged from last session's scoping): template
        variables beyond `{{variable}}` substitution (no template has
        needed conditionals/loops yet) and scaffolding straight into a new
        GitHub repo via the GitHub API (bigger jump — needs a repo-create
        token and real network calls in a place that's been
        injectable-fetch-only so far); both are reasonable Phase 5 stretch
        goals, not required for "golden paths, plural" itself
  - [x] 7 new/updated tests (website- and library-kind scaffolds, default-
        to-Service when `kind` is omitted, invalid-`kind` rejection, Kind
        selector rendered on the form) — 82 tests total, all passing; both
        packages type-check clean
  - [x] 3 new screenshots (Kind selector set to Website, the website
        scaffold's success page, and the catalog list showing Service/
        Website/Library badges side by side) — 14 screenshots total, all
        verified

- [x] **Phase 5 — Polish & deploy** *(tonight)*
  - [x] Shared-secret admin gate: an optional `ADMIN_TOKEN` env var, checked
        by `requireAdminToken` middleware (`packages/web/src/auth.ts`) via
        HTTP Basic auth (token as password, username ignored — there's one
        shared secret, not real accounts). Applied to the whole `/create`
        router (both the form and the submit, so the browser's native
        Basic-auth prompt fires before the user fills anything in) and to
        `POST /admin/refresh`. Unset, every route stays open — identical to
        pre-Phase-5 behavior, so this is additive, not a breaking change for
        the existing localhost/demo flow.
  - [x] Root `tsconfig.json` + `composite: true` on both packages' configs,
        wired together with TypeScript project references, so `npm run
        lint` (`tsc --build`) actually works from the repo root instead of
        erroring on a missing root config (the bug flagged at the end of
        last session). `@idp/web`'s own `tsc --noEmit` build script is
        unchanged.
  - [x] `.github/workflows/ci.yml`: `npm ci`, `npm run lint`, `npm test
        --workspaces` on every push to `main` and every pull request.
  - [x] Search/filter on the catalog list: `?q=` (matches name, description,
        owner, or any tag, case-insensitively), `?kind=`, `?lifecycle=`,
        combined with AND semantics. Implemented as `parseCatalogFilters`/
        `filterCatalogEntries` in `catalogView.ts` — a filter over the
        `CatalogEntry[]` the store already returns, no schema or storage
        change. Plain GET query params, so a filtered view is a shareable/
        bookmarkable URL, not something that needs client-side JS. The list
        page shows "N of M services match" and a "Clear" link when a filter
        is active, versus the plain count when it isn't.
  - [x] Deliberately out of scope, not deferred: a deployed demo instance
        and scaffolding directly into a new GitHub repo. Both need a real
        remote target (a hosting provider, a GitHub org/token with repo-
        create scope) that this environment's own ground rules exclude —
        this project's nightly workflow is local-commits-only, no remote
        repo creation, no pushing. The CI workflow file is committed and
        correct but has never executed, for the same reason. If this
        project ever gets a real remote, both are still exactly as
        reasonable as they were when first scoped.
  - [x] 10 new tests (admin-token gate on `/create` GET+POST and
        `/admin/refresh`, unit tests for `parseCatalogFilters`/
        `filterCatalogEntries` covering kind/lifecycle/search/AND-combination/
        case-insensitivity, route-level filter tests for search/kind/
        lifecycle and that submitted filter values round-trip into the
        form) — 100 tests total (45 core + 55 web), all passing; both
        packages type-check clean; root `tsc --build` clean.
  - [x] 4 screenshots recaptured (`01`, `08`, `14` — every view of the
        catalog list now shows the filter bar) and 1 new screenshot added
        for an active filter (`?kind=Website`, showing the match-count copy
        and the Clear-filters link) — 15 screenshots total, all verified.

## Where to resume (next session)

There is no next session to resume into under this project's own rules —
Phase 5 closes out everything reachable without a real remote target, and
the two items that do need one (deployed demo instance, scaffold-into-new-
GitHub-repo) are recorded above as permanently out of scope for this
environment rather than deferred. If this project picks back up with a real
GitHub org/token and a hosting target available, those two are the entire
remaining backlog — everything else (catalog, ownership/on-call, golden
paths, auth, CI, search/filter) is built, tested, and documented.

STATUS: COMPLETE
