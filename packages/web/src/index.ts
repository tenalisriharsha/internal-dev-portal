import path from "node:path";
import {
  CatalogStore,
  GitHubRepoSource,
  LocalDirectorySource,
  startScheduledRefresh,
  type CatalogSource,
} from "@idp/core";
import { createApp } from "./app";

const repoRoot = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.PORT ?? 3000);
const REFRESH_INTERVAL_MS = Number(process.env.CATALOG_REFRESH_INTERVAL_MS ?? 5 * 60_000);
const generatedDir = path.join(repoRoot, "generated");

/** CATALOG_GITHUB_REPOS="acme/widgets,acme/sprockets@main" adds each repo's catalog-info.yaml. */
function githubSourcesFromEnv(): CatalogSource[] {
  const raw = process.env.CATALOG_GITHUB_REPOS;
  if (!raw) return [];

  const repos = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [slug, ref] = entry.split("@");
      const [owner, repo] = slug.split("/");
      return { owner, repo, ref };
    });

  if (repos.length === 0) return [];
  return [new GitHubRepoSource({ repos, token: process.env.GITHUB_TOKEN })];
}

const sources: CatalogSource[] = [
  new LocalDirectorySource(path.join(repoRoot, "catalog", "examples")),
  new LocalDirectorySource(generatedDir),
  ...githubSourcesFromEnv(),
];

const store = new CatalogStore(path.join(repoRoot, "catalog.db"));

const app = createApp({
  repoRoot,
  store,
  sources,
  templateDir: path.join(repoRoot, "templates", "golden-path-service"),
  generatedDir,
  escalation: {
    pagerdutySubdomain: process.env.PAGERDUTY_SUBDOMAIN,
    opsgenieOrg: process.env.OPSGENIE_ORG,
  },
});

store
  .refresh(sources)
  .catch((err) => console.error("initial catalog refresh failed:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Internal Developer Portal listening on http://localhost:${PORT}`);
    });
  });

if (REFRESH_INTERVAL_MS > 0) {
  startScheduledRefresh(store, sources, REFRESH_INTERVAL_MS, {
    onError: (err) => console.error("scheduled catalog refresh failed:", err),
  });
}
