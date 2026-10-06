import path from "node:path";
import express, { type Express } from "express";
import type { AppOptions } from "./options";
import { createAdminRouter } from "./routes/admin";
import { createCatalogRouter } from "./routes/catalog";
import { createCreateRouter } from "./routes/create";
import { createGraphRouter } from "./routes/graph";
import { createTeamsRouter } from "./routes/teams";
import { layout } from "./views/layout";

export function createApp(options: AppOptions): Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use("/public", express.static(path.join(__dirname, "public")));

  app.use(createCatalogRouter(options));
  app.use(createTeamsRouter(options));
  app.use(createGraphRouter(options));
  app.use(createCreateRouter(options));
  app.use(createAdminRouter(options));

  app.use((_req, res) => {
    res.status(404).send(layout("Not Found", "<div class=\"page-header\"><h1>404</h1><p class=\"page-subtitle\">Page not found.</p></div>"));
  });

  return app;
}
