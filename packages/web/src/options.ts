import type { CatalogEntry, CatalogSource, CatalogStore } from "@idp/core";
import type { EscalationConfig } from "./oncallLinks";

/** One golden-path template directory per catalog `kind`, selectable in the create flow. */
export type TemplateDirs = Record<CatalogEntry["kind"], string>;

export interface AppOptions {
  /** Repo root, used only to display source file paths relative instead of absolute. */
  repoRoot: string;
  /** Persisted catalog snapshot. Pages read from this; nothing re-fetches sources on render. */
  store: CatalogStore;
  /** Where the catalog is fetched from on refresh: local directories, GitHub repos, etc. */
  sources: CatalogSource[];
  /** Golden-path template directories rendered by the self-service create flow, keyed by kind. */
  templateDirs: TemplateDirs;
  /** Directory the create flow writes newly scaffolded services into. Must be covered by `sources`. */
  generatedDir: string;
  /** Optional deep-link config for turning on-call rotation names into provider schedule links. */
  escalation?: EscalationConfig;
  /** When set, POST /admin/refresh and POST /create require this as a Basic-auth password. */
  adminToken?: string;
}
