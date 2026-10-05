import path from "node:path";
import { Catalog } from "@idp/core";
import type { AppOptions } from "./options";

/** Reads the persisted snapshot and rehydrates it as a Catalog, without touching any source. */
export function readCatalog(options: AppOptions): Catalog {
  return Catalog.fromSnapshot(options.store.snapshot());
}

/** Local file paths display relative to the repo; GitHub source ids display as-is. */
export function displaySource(repoRoot: string, sourceId: string | undefined): string | undefined {
  if (!sourceId) return undefined;
  return path.isAbsolute(sourceId) ? path.relative(repoRoot, sourceId) : sourceId;
}
