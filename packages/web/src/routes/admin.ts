import { Router } from "express";
import type { AppOptions } from "../options";

/**
 * Explicit refresh trigger: re-fetches every configured source and persists
 * the result. Meant to be wired to a "Refresh now" button and, eventually, a
 * repo webhook on push to catalog-info.yaml — never called implicitly on a
 * page read.
 */
export function createAdminRouter(options: AppOptions): Router {
  const router = Router();

  router.post("/admin/refresh", async (req, res) => {
    await options.store.refresh(options.sources);
    const requested = typeof req.query.redirectTo === "string" ? req.query.redirectTo : "/";
    // Only ever redirect back into this app — reject anything that could send a browser elsewhere.
    const redirectTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
    res.redirect(303, redirectTo);
  });

  return router;
}
