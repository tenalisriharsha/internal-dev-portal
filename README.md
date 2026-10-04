# internal-dev-portal

A lightweight, Backstage-style internal developer platform: a service catalog
built from `catalog-info.yaml` metadata in each repo, ownership and on-call
info, a dependency graph between services, and a self-service "create new
service" flow wired to a golden-path template.

## Project Status

This is a multi-night build, in progress. See [PROGRESS.md](PROGRESS.md) for
the full architecture writeup, the phased build plan, and exactly where work
resumes next.

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

**Scaffold result** — the real files generated on disk and registered in the
catalog immediately.

![Service created successfully](docs/screenshots/06-create-success.png)

**Catalog after self-service creation** — the new service is live, no restart,
no manual registration step.

![Catalog showing the newly created service](docs/screenshots/07-catalog-list-updated.png)

## Architecture

An npm-workspaces monorepo with two TypeScript packages:

- **`@idp/core`** — the domain layer: a Zod schema for `catalog-info.yaml`, a
  catalog loader that scans directories and validates every file, a
  dependency-graph builder with cycle detection, and a template engine that
  renders the golden-path scaffold.
- **`@idp/web`** — a server-rendered Express app (catalog list, service
  detail, dependency graph, create flow) built on top of `@idp/core`.

Full details, including the request/data flow and why the catalog reloads
from disk on every request, are in [PROGRESS.md](PROGRESS.md).

## Getting started

```sh
npm install
npx tsc --build packages/core   # @idp/web imports the compiled @idp/core
npm run dev --workspace=@idp/web
```

Then open `http://localhost:3000`.

## Running tests

```sh
npm test
```

Runs the full suite for both packages: catalog/schema/graph/template unit
tests in `@idp/core`, and route-level integration tests (including the full
create-service flow) in `@idp/web`.

## Repository layout

```
packages/core/            catalog schema, loader, dependency graph, template engine
packages/web/             Express app: catalog UI, service detail, graph, create flow
catalog/examples/         example catalog-info.yaml fixtures (stand-ins for "other repos")
templates/golden-path-service/  the scaffold the self-service flow renders
generated/                where self-service "create new service" writes new services
docs/screenshots/         screenshots used in this README
```
