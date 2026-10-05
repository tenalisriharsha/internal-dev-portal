import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { Catalog, type CatalogSnapshot } from "./catalog";
import type { CatalogSource } from "./source";

// Resolved via process.getBuiltinModule rather than a static `import ... from "node:sqlite"`
// because bundlers (vite/vitest's module runner included) don't yet recognize this builtin
// and fail to resolve it statically even though Node itself supports it fine.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

interface ServiceRow {
  name: string;
  data: string;
  source_id: string;
}

interface ErrorRow {
  file: string;
  message: string;
}

/**
 * Persists the catalog to SQLite so a page load is a read, not a re-fetch.
 * The catalog only changes when `refresh` is called explicitly (on a
 * schedule, from the create flow, or from an admin/webhook route) — never
 * implicitly as a side effect of reading it.
 */
export class CatalogStore {
  private readonly db: DatabaseSyncType;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        source_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_errors (
        file TEXT NOT NULL,
        message TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /** Reloads the catalog from the given sources and persists the result. */
  async refresh(sources: CatalogSource[]): Promise<CatalogSnapshot> {
    const catalog = await Catalog.load(sources);
    const snapshot = catalog.toSnapshot();

    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM services");
      this.db.exec("DELETE FROM catalog_errors");

      const insertService = this.db.prepare(
        "INSERT INTO services (name, data, source_id) VALUES (?, ?, ?)",
      );
      for (const entry of snapshot.entries) {
        insertService.run(
          entry.metadata.name,
          JSON.stringify(entry),
          snapshot.sourceFiles[entry.metadata.name] ?? "",
        );
      }

      const insertError = this.db.prepare(
        "INSERT INTO catalog_errors (file, message) VALUES (?, ?)",
      );
      for (const issue of snapshot.errors) {
        insertError.run(issue.file, issue.message);
      }

      this.db
        .prepare(
          "INSERT INTO meta (key, value) VALUES ('refreshedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(new Date().toISOString());

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }

    return this.snapshot();
  }

  /** Reads the last persisted snapshot. Never touches a source. */
  snapshot(): CatalogSnapshot {
    const serviceRows = this.db
      .prepare("SELECT name, data, source_id FROM services ORDER BY name")
      .all() as unknown as ServiceRow[];
    const errorRows = this.db
      .prepare("SELECT file, message FROM catalog_errors")
      .all() as unknown as ErrorRow[];

    return {
      entries: serviceRows.map((row) => JSON.parse(row.data)),
      errors: errorRows.map((row) => ({ file: row.file, message: row.message })),
      sourceFiles: Object.fromEntries(serviceRows.map((row) => [row.name, row.source_id])),
    };
  }

  /** ISO timestamp of the last successful refresh, or null if one has never run. */
  refreshedAt(): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'refreshedAt'").get() as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  close(): void {
    this.db.close();
  }
}
