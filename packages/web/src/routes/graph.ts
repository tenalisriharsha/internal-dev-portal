import { buildDependencyGraph, Catalog } from "@idp/core";
import { Router } from "express";
import type { AppOptions } from "../options";
import { renderGraphPage } from "../views/graphPage";

export function createGraphRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/graph", async (_req, res) => {
    const catalog = await Catalog.loadFromDirectories(options.catalogDirs);
    const graph = buildDependencyGraph(catalog);
    res.send(renderGraphPage(graph));
  });

  return router;
}
