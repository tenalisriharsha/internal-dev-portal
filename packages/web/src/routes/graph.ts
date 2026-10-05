import { buildDependencyGraph } from "@idp/core";
import { Router } from "express";
import type { AppOptions } from "../options";
import { readCatalog } from "../catalogView";
import { renderGraphPage } from "../views/graphPage";

export function createGraphRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/graph", (_req, res) => {
    const graph = buildDependencyGraph(readCatalog(options));
    res.send(renderGraphPage(graph));
  });

  return router;
}
