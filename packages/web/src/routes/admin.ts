import { Router } from "express";
import { requireAdminToken } from "../auth";
import type { AppOptions } from "../options";

/**
 * Explicit refresh trigger: re-fetches every configured source and persists
 * the result. Meant to be wired to a "Refresh now" button and, eventually, a
 * repo webhook on push to catalog-info.yaml — never called implicitly on a
 * page read.
 */
export function createAdminRouter(options: AppOptions): Router {
  const router = Router();

  router.post("/admin/refresh", requireAdminToken(options.adminToken), async (req, res) => {
    await options.store.refresh(options.sources);
    const requested = typeof req.query.redirectTo === "string" ? req.query.redirectTo : "/";
    // Only ever redirect back into this app — reject anything that could send a browser elsewhere.
    // Normalize backslashes before the check: browsers (and the WHATWG URL spec) treat a leading
    // backslash the same as a leading forward slash for special schemes, so "/\evil.com" would
    // otherwise slip past the "//" check and resolve to an off-site redirect.
    const normalized = requested.replace(/\\/g, "/");
    const redirectTo = requested.startsWith("/") && !normalized.startsWith("//") ? requested : "/";
    res.redirect(303, redirectTo);
  });

  return router;
}
