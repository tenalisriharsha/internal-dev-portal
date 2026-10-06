import type { CatalogEntry } from "@idp/core";
import { Router } from "express";
import type { AppOptions } from "../options";
import { readCatalog } from "../catalogView";
import { renderTeamDetail, renderTeamNotFound } from "../views/teamDetail";
import { renderTeamsList, type TeamSummary } from "../views/teamsList";

function groupByOwner(entries: CatalogEntry[]): TeamSummary[] {
  const byOwner = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const services = byOwner.get(entry.spec.owner) ?? [];
    services.push(entry);
    byOwner.set(entry.spec.owner, services);
  }
  return [...byOwner.entries()]
    .map(([owner, services]) => ({ owner, services }))
    .sort((a, b) => a.owner.localeCompare(b.owner));
}

export function createTeamsRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/teams", (_req, res) => {
    const catalog = readCatalog(options);
    res.send(renderTeamsList(groupByOwner(catalog.list())));
  });

  router.get("/teams/:owner", (req, res) => {
    const catalog = readCatalog(options);
    const services = catalog.list().filter((entry) => entry.spec.owner === req.params.owner);
    if (services.length === 0) {
      res.status(404).send(renderTeamNotFound(req.params.owner));
      return;
    }
    res.send(renderTeamDetail(req.params.owner, services, options.escalation ?? {}));
  });

  return router;
}
