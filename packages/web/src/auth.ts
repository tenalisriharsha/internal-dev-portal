import type { NextFunction, Request, Response } from "express";

/**
 * Gate for state-mutating routes (admin refresh, create). When `token` is
 * unset (no ADMIN_TOKEN configured), every request passes through unchanged
 * — this keeps a localhost/demo deploy working exactly as before auth
 * existed. When set, callers must present it as a Basic-auth password; the
 * username is ignored since there's only one shared secret, not real
 * accounts.
 */
export function requireAdminToken(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!token) {
      next();
      return;
    }

    const header = req.headers.authorization ?? "";
    const [scheme, encoded] = header.split(" ");
    const presented = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString("utf8").split(":")[1] : undefined;

    if (presented === token) {
      next();
      return;
    }

    res.set("WWW-Authenticate", 'Basic realm="idp-admin"');
    res.status(401).send("Admin token required.");
  };
}
