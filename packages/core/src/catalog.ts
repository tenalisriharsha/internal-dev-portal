import { promises as fs } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { CatalogEntry, CatalogEntrySchema } from "./schema";

export const CATALOG_FILE_NAME = "catalog-info.yaml";

export interface ValidationIssue {
  file: string;
  message: string;
}

/**
 * Finds every catalog-info.yaml file nested up to one level deep inside
 * each given root directory (root/<service>/catalog-info.yaml).
 */
async function findCatalogFiles(rootDir: string): Promise<string[]> {
  let subdirs: string[];
  try {
    subdirs = (await fs.readdir(rootDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootDir, entry.name));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const found: string[] = [];
  for (const dir of subdirs) {
    const candidate = path.join(dir, CATALOG_FILE_NAME);
    try {
      await fs.access(candidate);
      found.push(candidate);
    } catch {
      // no catalog-info.yaml in this directory, skip it
    }
  }
  return found;
}

export class Catalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly sourceFiles = new Map<string, string>();
  readonly errors: ValidationIssue[] = [];

  static async loadFromDirectories(rootDirs: string[]): Promise<Catalog> {
    const catalog = new Catalog();
    for (const rootDir of rootDirs) {
      const files = await findCatalogFiles(rootDir);
      for (const file of files) {
        await catalog.loadFile(file);
      }
    }
    return catalog;
  }

  private async loadFile(file: string): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      this.errors.push({ file, message: `could not read file: ${String(err)}` });
      return;
    }

    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch (err) {
      this.errors.push({ file, message: `invalid YAML: ${String(err)}` });
      return;
    }

    const result = CatalogEntrySchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      this.errors.push({ file, message });
      return;
    }

    const name = result.data.metadata.name;
    if (this.entries.has(name)) {
      this.errors.push({
        file,
        message: `duplicate service name "${name}" (already defined in ${this.sourceFiles.get(name)})`,
      });
      return;
    }

    this.entries.set(name, result.data);
    this.sourceFiles.set(name, file);
  }

  list(): CatalogEntry[] {
    return [...this.entries.values()].sort((a, b) =>
      a.metadata.name.localeCompare(b.metadata.name),
    );
  }

  get(name: string): CatalogEntry | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  sourceFileFor(name: string): string | undefined {
    return this.sourceFiles.get(name);
  }

  /** Services that declare a dependency on the given service name. */
  getDependents(name: string): CatalogEntry[] {
    return this.list().filter((entry) => entry.spec.dependsOn.includes(name));
  }

  get size(): number {
    return this.entries.size;
  }
}
