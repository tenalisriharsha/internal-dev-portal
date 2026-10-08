import path from "node:path";
import { Catalog, type CatalogEntry } from "@idp/core";
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

export interface CatalogFilters {
  q: string;
  kind: string;
  lifecycle: string;
}

/** Reads `?q=`, `?kind=`, `?lifecycle=` off the request query, defaulting every field to "". */
export function parseCatalogFilters(query: Record<string, unknown>): CatalogFilters {
  return {
    q: typeof query.q === "string" ? query.q.trim() : "",
    kind: typeof query.kind === "string" ? query.kind : "",
    lifecycle: typeof query.lifecycle === "string" ? query.lifecycle : "",
  };
}

/** `q` matches name, description, owner, or any tag, case-insensitively. */
export function filterCatalogEntries(entries: CatalogEntry[], filters: CatalogFilters): CatalogEntry[] {
  const needle = filters.q.toLowerCase();
  return entries.filter((entry) => {
    if (filters.kind && entry.kind !== filters.kind) return false;
    if (filters.lifecycle && entry.spec.lifecycle !== filters.lifecycle) return false;
    if (!needle) return true;
    const haystack = [entry.metadata.name, entry.metadata.description, entry.spec.owner, ...entry.metadata.tags]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}
