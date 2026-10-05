import yaml from "js-yaml";
import { CatalogEntry, CatalogEntrySchema } from "./schema";
import { CatalogSource, LocalDirectorySource } from "./source";

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface CatalogSnapshot {
  entries: CatalogEntry[];
  errors: ValidationIssue[];
  /** Maps service name -> the source id (file path or github:owner/repo) it was loaded from. */
  sourceFiles: Record<string, string>;
}

export class Catalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly sourceFiles = new Map<string, string>();
  readonly errors: ValidationIssue[] = [];

  /** Loads and validates catalog-info.yaml files from every given source, merging into one catalog. */
  static async load(sources: CatalogSource[]): Promise<Catalog> {
    const catalog = new Catalog();
    for (const source of sources) {
      const { files, errors } = await source.load();
      catalog.errors.push(...errors);
      for (const file of files) {
        catalog.loadRaw(file.id, file.contents);
      }
    }
    return catalog;
  }

  /** Convenience wrapper over `load` for local directory trees (fixtures, tests, generated/). */
  static async loadFromDirectories(rootDirs: string[]): Promise<Catalog> {
    return Catalog.load(rootDirs.map((dir) => new LocalDirectorySource(dir)));
  }

  /** Rehydrates a catalog from an already-validated snapshot (e.g. read from a CatalogStore). */
  static fromSnapshot(snapshot: CatalogSnapshot): Catalog {
    const catalog = new Catalog();
    for (const entry of snapshot.entries) {
      catalog.entries.set(entry.metadata.name, entry);
      catalog.sourceFiles.set(entry.metadata.name, snapshot.sourceFiles[entry.metadata.name] ?? "");
    }
    catalog.errors.push(...snapshot.errors);
    return catalog;
  }

  private loadRaw(id: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch (err) {
      this.errors.push({ file: id, message: `invalid YAML: ${String(err)}` });
      return;
    }

    const result = CatalogEntrySchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      this.errors.push({ file: id, message });
      return;
    }

    const name = result.data.metadata.name;
    if (this.entries.has(name)) {
      this.errors.push({
        file: id,
        message: `duplicate service name "${name}" (already defined in ${this.sourceFiles.get(name)})`,
      });
      return;
    }

    this.entries.set(name, result.data);
    this.sourceFiles.set(name, id);
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

  toSnapshot(): CatalogSnapshot {
    return {
      entries: this.list(),
      errors: [...this.errors],
      sourceFiles: Object.fromEntries(this.sourceFiles),
    };
  }

  get size(): number {
    return this.entries.size;
  }
}
