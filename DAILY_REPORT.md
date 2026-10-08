# Daily Report

A summary of what was built each night, final test results, known
limitations, and ideas for future work. See [PROGRESS.md](PROGRESS.md) for
the detailed, phase-by-phase technical writeup this report summarizes.

## What was built, by night

**Night 1 — Scaffold & core foundation.** npm-workspaces monorepo
(`@idp/core`, `@idp/web`). Zod schema for `catalog-info.yaml`, a YAML loader
that collects validation errors instead of crashing on a bad file, a
dependency-graph builder with cycle detection and topological sort, and a
golden-path template engine (`{{variable}}` substitution, refuses to
overwrite an existing output directory). Six example services modeling a
small e-commerce org. A server-rendered Express UI: catalog list, service
detail, dependency graph (hand-laid-out SVG), and a self-service create
flow. 37 tests, 7 verified screenshots.

**Night 2 — Persistence & real-world ingestion.** A `CatalogSource`
abstraction so the catalog can load from more than a local directory tree:
`LocalDirectorySource` (unchanged) and `GitHubRepoSource` (fetches
`catalog-info.yaml` from a configurable list of repos via the GitHub
Contents API, injectable fetch so tests never touch the network). Swapped
"reload on every request" for a SQLite-backed `CatalogStore` — reads are
persisted-snapshot reads; the catalog only changes on an explicit
`refresh()` (startup, an interval scheduler, or the new `POST
/admin/refresh` button). Validation errors surfaced as a banner on the
catalog list. 59 tests, 8 screenshots.

**Night 3 — Ownership & on-call depth.** `/teams` and `/teams/:owner` pages
grouping services by `spec.owner` at render time (no new "team" entity in
the schema). Team pages aggregate on-call rotations and roll up open
incidents / most recent deploy. An optional `spec.health` block
(`lastDeployAt`, `openIncidents`) renders as a color-coded panel on service
detail, with an explicit empty state when a service reports none. On-call
rotation names become deep links into PagerDuty/Opsgenie schedule search
when `PAGERDUTY_SUBDOMAIN`/`OPSGENIE_ORG` is configured, plain text
otherwise. 78 tests, 11 screenshots.

**Night 4 — Golden paths, plural.** Three real golden-path templates
(`golden-path-service`, `-website`, `-library`), each shaped for how that
kind actually gets used — a website template with a `serve`-based `dev`
script, a library template with no `dev` script at all. `options.templateDir`
became `options.templateDirs` keyed by kind; a "Kind" selector in the create
form picks which one renders. The template engine itself needed zero
changes. 82 tests, 14 screenshots.

**Night 5 — Polish.** A shared-secret `ADMIN_TOKEN` gate (HTTP Basic auth)
in front of the whole `/create` flow and `POST /admin/refresh`, off by
default so a plain localhost run is unaffected. A root `tsconfig.json` with
TypeScript project references so `npm run lint` (`tsc --build`) actually
works across both packages, fixing a bug flagged at the end of Night 4.
A GitHub Actions CI workflow (lint + full test suite on every push/PR).
Search/filter on the catalog list (`?q=`/`?kind=`/`?lifecycle=`, shareable
as a plain URL, no client-side JS). 100 tests, 15 screenshots.

## Final test results

```
@idp/core: 45 tests passing (schema, source, catalog, store, scheduler, graph, template)
@idp/web:  55 tests passing (oncallLinks, catalogView filters, full route/integration suite)
Total:     100 tests passing, 0 failing
Type-check: clean (root `tsc --build` across both packages via project references)
```

## Known limitations

- **No real identity provider.** `ADMIN_TOKEN` is a single shared secret
  checked via HTTP Basic auth — enough to keep a localhost/demo deploy from
  being wide open, not a substitute for real user accounts, roles, or audit
  logging. Fine for this project's scope; would need replacing before any
  real multi-user deployment.
- **On-call escalation links are a URL pattern, not a live integration.**
  `oncallLinks.escalationUrl` builds a deep link into a provider's schedule
  *search*, not a resolved schedule — there's no real PagerDuty/Opsgenie
  account behind this demo to verify against or call an API for.
- **Template variables are substitution-only.** No conditionals or loops in
  `{{variable}}` templates — never needed them across three golden paths,
  but a template requiring per-dependency loops (e.g. rendering a config
  block per `dependsOn` entry) would need the engine extended first.
- **No deployed instance.** The CI workflow file is committed and correct
  but has never run, and there's no hosted demo — both need a real remote
  (a GitHub remote to push to, a hosting target to deploy to), which this
  project's nightly workflow deliberately never sets up (local commits
  only, no remote repo creation). See PROGRESS.md's Phase 5 section for the
  full reasoning.
- **No pagination or sort order on the catalog list.** Filtering narrows
  the list but there's no explicit sort (services render alphabetically by
  name, the one order `Catalog.list()` has ever returned) and no pagination
  — fine at demo scale (single digits to low tens of services), would need
  addressing well before hundreds.

## Future ideas

- Deploy a live demo instance once a real remote/hosting target exists, and
  point CI's badge at it.
- Scaffold `/create` directly into a new GitHub repo via the GitHub API
  (needs a repo-create-scoped token) instead of only into `generated/`.
- Sort/group the catalog list by owner or lifecycle, not just filter it.
- Real identity (OAuth/SSO) in front of the admin surface instead of a
  single shared token.
- A repo webhook on push to `catalog-info.yaml` that calls `POST
  /admin/refresh` automatically, so the catalog stays current without
  anyone pressing the button or waiting for the interval scheduler.
