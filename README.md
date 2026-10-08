# internal-dev-portal

A lightweight, Backstage-style internal developer platform: a service catalog
built from `catalog-info.yaml` metadata in each repo, ownership and on-call
info, a dependency graph between services, and a self-service "create new
service" flow wired to a golden-path template.

## Project Status

This is a multi-night build. All five phases are complete — catalog,
ownership/on-call, golden paths, and polish (auth, CI, search/filter). See
[PROGRESS.md](PROGRESS.md) for the full architecture writeup and phased build
history, and [DAILY_REPORT.md](DAILY_REPORT.md) for a summary of what was
built each night, test results, and known limitations.

## Preview

**Service catalog** — every service registered from `catalog-info.yaml`
metadata, with lifecycle and ownership at a glance.

![Service catalog](docs/screenshots/01-catalog-list.png)

**Service detail** — ownership, on-call rotation, and both directions of the
dependency relationship for a single service.

![Service detail](docs/screenshots/02-service-detail.png)

**Dependency graph** — the full service graph, nodes colored by lifecycle
status, arrows pointing from a service to what it depends on.

![Dependency graph](docs/screenshots/03-dependency-graph.png)

**Self-service create flow** — a form that scaffolds a new service from the
golden-path template.

![Create new service form](docs/screenshots/04-create-form-empty.png)

![Create new service form filled out](docs/screenshots/05-create-form-filled.png)

**Golden paths, plural** — a "Kind" selector picks which golden-path template
to scaffold from (`Service`, `Website`, or `Library`); each renders its own
template directory, not just a different `catalog-info.yaml` value.

![Create new service form with Kind set to Website](docs/screenshots/12-create-form-kind-website.png)

![Service created from the website golden path, listing its generated files](docs/screenshots/13-create-success-website.png)

![Catalog list showing Service, Website, and Library kind badges side by side](docs/screenshots/14-catalog-list-mixed-kinds.png)

**Search & filter** — the catalog list filters by free-text search (name,
description, owner, tags) and by `Kind`/`Lifecycle`, all via plain GET query
params (`?q=&kind=&lifecycle=`), so a filtered view is a shareable URL.

![Catalog list filtered to kind=Website, showing a 1-of-8 match count and a Clear-filters link](docs/screenshots/15-catalog-list-filtered.png)

**Scaffold result** — the real files generated on disk and registered in the
catalog immediately.

![Service created successfully](docs/screenshots/06-create-success.png)

**Catalog after self-service creation** — the new service is live immediately:
the create flow triggers an explicit catalog refresh, no restart, no manual
registration step.

![Catalog showing the newly created service](docs/screenshots/07-catalog-list-updated.png)

**Catalog validation errors** — a malformed `catalog-info.yaml` is skipped,
not allowed to crash the catalog, and surfaced in a banner instead of silently
disappearing.

![Catalog list showing a validation error banner](docs/screenshots/08-catalog-validation-errors.png)

**Teams** — every owner that appears in `spec.owner` across the catalog,
aggregated into a team card: service count, total open incidents, and how
many distinct on-call rotations back it.

![Teams list showing five teams with aggregated incident and rotation counts](docs/screenshots/09-teams-list.png)

**Team detail** — every service a team owns in one place, its combined
on-call rotations (linked out to the provider when configured), and a
health rollup across the whole team.

![Team detail page for team-checkout showing two services and aggregated health](docs/screenshots/10-team-detail.png)

**Service health & on-call escalation** — a `spec.health` block
(`lastDeployAt`, `openIncidents`) renders as a color-coded panel, and when
`PAGERDUTY_SUBDOMAIN`/`OPSGENIE_ORG` is configured, the rotation name becomes
a deep link into that provider's schedule search.

![Service detail page showing a health panel and a linked on-call rotation](docs/screenshots/11-service-detail-health.png)

## Architecture

An npm-workspaces monorepo with two TypeScript packages:

- **`@idp/core`** — the domain layer: a Zod schema for `catalog-info.yaml`
  (metadata, ownership, lifecycle, on-call, and an optional `health` block —
  `lastDeployAt` and `openIncidents`), a `CatalogSource` abstraction (local
  directories and a GitHub-repos source, both implementing the same
  interface) feeding a validating catalog loader, a SQLite-backed
  `CatalogStore` that persists the last-loaded snapshot, a scheduler that
  refreshes the store on an interval, a dependency-graph builder with cycle
  detection, and a template engine that renders a golden-path scaffold
  (variable substitution only — no conditionals/loops yet, since no template
  has needed them).
- **`@idp/web`** — a server-rendered Express app (catalog list, service
  detail, team pages, dependency graph, create flow, and an `/admin/refresh`
  trigger) built on top of `@idp/core`. The create flow renders one of three
  golden-path templates (`templates/golden-path-service`,
  `-website`, `-library`) selected by a "Kind" field in the form — adding a
  template is adding a directory and a `templateDirs` entry, the rendering
  engine itself didn't change. Every page read is a SQLite read, not
  a re-fetch — the catalog only changes on an explicit refresh (scheduled,
  button-triggered, or after the create flow scaffolds a new service). Team
  pages (`/teams`, `/teams/:owner`) group services by `spec.owner` with no
  separate "team" entity — a team is just whatever string appears as an
  owner — and roll up each team's open incidents and on-call rotations.
  When `PAGERDUTY_SUBDOMAIN` or `OPSGENIE_ORG` is set, on-call rotation
  names render as links into that provider's schedule search instead of
  plain text. The catalog list supports `?q=`/`?kind=`/`?lifecycle=` query-
  param filtering over the already-loaded `CatalogEntry[]` — no new backend
  plumbing, just a filter over data the store already has. When `ADMIN_TOKEN`
  is set, `/create` and `POST /admin/refresh` are gated behind HTTP Basic
  auth (the token as the password, any username); unset, every route stays
  open, matching pre-Phase-5 behavior for a localhost demo.

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `npm run lint`
(a root `tsc --build` across both packages via TypeScript project references)
and the full test suite on every push and pull request.

Full details, including the source/store abstraction boundary, are in
[PROGRESS.md](PROGRESS.md).

## Getting started

```sh
npm install
npx tsc --build packages/core   # @idp/web imports the compiled @idp/core
npm run dev --workspace=@idp/web
```

Then open `http://localhost:3000`. On startup the server does an initial
catalog refresh and then re-refreshes every 5 minutes by default; both
local-directory and (if configured) GitHub sources are read, validated, and
persisted to a `catalog.db` SQLite file at the repo root.

Optional environment variables:

```sh
PORT=3000                              # server port
CATALOG_REFRESH_INTERVAL_MS=300000     # scheduled refresh interval; 0 disables it
CATALOG_GITHUB_REPOS=acme/widgets,acme/sprockets@main   # owner/repo[@ref], comma-separated
GITHUB_TOKEN=ghp_...                   # only needed for private repos / higher rate limits
PAGERDUTY_SUBDOMAIN=acme               # turns pagerduty rotations into schedule-search links
OPSGENIE_ORG=acme                      # turns opsgenie rotations into schedule-search links
ADMIN_TOKEN=some-shared-secret         # when set, gates /create and POST /admin/refresh behind Basic auth
```

## Running tests

```sh
npm test
```

Runs the full suite for both packages: catalog/schema/source/store/scheduler/
graph/template unit tests in `@idp/core`, and route-level integration tests
(including the full create-service flow, the explicit refresh route, team
pages, on-call escalation links, catalog search/filter, and the admin-token
gate) in `@idp/web`. The GitHub source is tested with an injected fetch
function, so the suite never makes a real network call.

```sh
npm run lint   # tsc --build across both packages, via root tsconfig.json project references
```

## Repository layout

```
.github/workflows/ci.yml  lint + test on every push/PR
packages/core/            catalog schema, sources, SQLite store, scheduler, dependency graph, template engine
packages/web/             Express app: catalog UI, service detail, graph, create flow, admin refresh, auth
catalog/examples/         example catalog-info.yaml fixtures (stand-ins for "other repos")
templates/golden-path-service/   golden path for kind: Service
templates/golden-path-website/   golden path for kind: Website
templates/golden-path-library/   golden path for kind: Library
generated/                where self-service "create new service" writes new services
docs/screenshots/         screenshots used in this README
tsconfig.json              root project-reference config, used by `npm run lint`
catalog.db                 (gitignored) persisted catalog snapshot, created on first run
```
