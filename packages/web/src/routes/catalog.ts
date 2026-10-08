import { Router } from "express";
import type { AppOptions } from "../options";
import { displaySource, filterCatalogEntries, parseCatalogFilters, readCatalog } from "../catalogView";
import { renderCatalogList } from "../views/catalogList";
import { renderServiceDetail, renderServiceNotFound } from "../views/serviceDetail";

export function createCatalogRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const catalog = readCatalog(options);
    const errors = catalog.errors.map((issue) => ({
      ...issue,
      file: displaySource(options.repoRoot, issue.file) ?? issue.file,
    }));
    const filters = parseCatalogFilters(req.query as Record<string, unknown>);
    const entries = filterCatalogEntries(catalog.list(), filters);
    res.send(renderCatalogList(entries, errors, options.store.refreshedAt(), filters, catalog.size));
  });

  router.get("/services/:name", (req, res) => {
    const catalog = readCatalog(options);
    const entry = catalog.get(req.params.name);
    if (!entry) {
      res.status(404).send(renderServiceNotFound(req.params.name));
      return;
    }
    const dependents = catalog.getDependents(entry.metadata.name);
    const source = displaySource(options.repoRoot, catalog.sourceFileFor(entry.metadata.name));
    res.send(renderServiceDetail(entry, dependents, source, options.escalation ?? {}));
  });

  return router;
}
