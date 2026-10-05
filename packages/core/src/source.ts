import { promises as fs } from "node:fs";
import path from "node:path";
import type { ValidationIssue } from "./catalog";

export const CATALOG_FILE_NAME = "catalog-info.yaml";

export interface RawCatalogFile {
  /** Human-readable identifier used for source attribution and error reporting. */
  id: string;
  contents: string;
}

export interface SourceLoadResult {
  files: RawCatalogFile[];
  errors: ValidationIssue[];
}

/** Where catalog-info.yaml files are fetched from: a local directory tree, a GitHub org, etc. */
export interface CatalogSource {
  load(): Promise<SourceLoadResult>;
}

/**
 * Finds every catalog-info.yaml file nested up to one level deep inside
 * the given root directory (root/<service>/catalog-info.yaml).
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

/** Reads catalog-info.yaml files from a local directory tree (fixtures, generated/, etc.). */
export class LocalDirectorySource implements CatalogSource {
  constructor(private readonly rootDir: string) {}

  async load(): Promise<SourceLoadResult> {
    const files: RawCatalogFile[] = [];
    const errors: ValidationIssue[] = [];

    for (const file of await findCatalogFiles(this.rootDir)) {
      try {
        files.push({ id: file, contents: await fs.readFile(file, "utf8") });
      } catch (err) {
        errors.push({ file, message: `could not read file: ${String(err)}` });
      }
    }

    return { files, errors };
  }
}

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  /** Branch, tag, or commit SHA. Defaults to the repo's default branch. */
  ref?: string;
  /** Path to the catalog file within the repo. Defaults to catalog-info.yaml at the root. */
  path?: string;
}

export interface GitHubRepoSourceOptions {
  repos: GitHubRepoRef[];
  /** Personal access token, sent as a Bearer token. Needed for private repos / higher rate limits. */
  token?: string;
  apiBaseUrl?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/** Fetches catalog-info.yaml from a configured list of GitHub repos via the Contents API. */
export class GitHubRepoSource implements CatalogSource {
  constructor(private readonly options: GitHubRepoSourceOptions) {}

  async load(): Promise<SourceLoadResult> {
    const files: RawCatalogFile[] = [];
    const errors: ValidationIssue[] = [];
    const fetchFn = this.options.fetchFn ?? fetch;
    const apiBaseUrl = this.options.apiBaseUrl ?? "https://api.github.com";

    for (const repo of this.options.repos) {
      const id = `github:${repo.owner}/${repo.repo}`;
      const filePath = repo.path ?? CATALOG_FILE_NAME;
      const query = repo.ref ? `?ref=${encodeURIComponent(repo.ref)}` : "";
      const url = `${apiBaseUrl}/repos/${repo.owner}/${repo.repo}/contents/${filePath}${query}`;

      try {
        const res = await fetchFn(url, {
          headers: {
            Accept: "application/vnd.github.raw",
            ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
          },
        });

        if (res.status === 404) continue;
        if (!res.ok) {
          errors.push({ file: id, message: `GitHub API error ${res.status}: ${res.statusText}` });
          continue;
        }

        files.push({ id, contents: await res.text() });
      } catch (err) {
        errors.push({ file: id, message: `failed to fetch from GitHub: ${String(err)}` });
      }
    }

    return { files, errors };
  }
}
