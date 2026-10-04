import { Catalog } from "@idp/core";
import { Router } from "express";
import type { AppOptions } from "../options";
import { renderCatalogList } from "../views/catalogList";
import { renderServiceDetail, renderServiceNotFound } from "../views/serviceDetail";

export function createCatalogRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const catalog = await Catalog.loadFromDirectories(options.catalogDirs);
    res.send(renderCatalogList(catalog.list()));
  });

  router.get("/services/:name", async (req, res) => {
    const catalog = await Catalog.loadFromDirectories(options.catalogDirs);
    const entry = catalog.get(req.params.name);
    if (!entry) {
      res.status(404).send(renderServiceNotFound(req.params.name));
      return;
    }
    const dependents = catalog.getDependents(entry.metadata.name);
    res.send(renderServiceDetail(entry, dependents, catalog.sourceFileFor(entry.metadata.name)));
  });

  return router;
}
