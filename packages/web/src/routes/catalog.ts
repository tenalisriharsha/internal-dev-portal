import { Router } from "express";
import type { AppOptions } from "../options";
import { displaySource, readCatalog } from "../catalogView";
import { renderCatalogList } from "../views/catalogList";
import { renderServiceDetail, renderServiceNotFound } from "../views/serviceDetail";

export function createCatalogRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const catalog = readCatalog(options);
    const errors = catalog.errors.map((issue) => ({
      ...issue,
      file: displaySource(options.repoRoot, issue.file) ?? issue.file,
    }));
    res.send(renderCatalogList(catalog.list(), errors, options.store.refreshedAt()));
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
