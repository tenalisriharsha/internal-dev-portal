import type { CatalogEntry } from "@idp/core";
import { describe, expect, it } from "vitest";
import { filterCatalogEntries, parseCatalogFilters } from "../src/catalogView";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    apiVersion: "idp.dev/v1",
    kind: "Service",
    metadata: { name: "user-service", description: "Handles users.", tags: [] },
    spec: { lifecycle: "production", owner: "team-identity", dependsOn: [] },
    ...overrides,
  } as CatalogEntry;
}

describe("parseCatalogFilters", () => {
  it("defaults every field to an empty string when absent", () => {
    expect(parseCatalogFilters({})).toEqual({ q: "", kind: "", lifecycle: "" });
  });

  it("trims whitespace from the search term", () => {
    expect(parseCatalogFilters({ q: "  billing  " }).q).toBe("billing");
  });

  it("ignores non-string query values", () => {
    expect(parseCatalogFilters({ q: ["billing"] }).q).toBe("");
  });
});

describe("filterCatalogEntries", () => {
  const entries = [
    entry({ metadata: { name: "user-service", description: "Handles users.", tags: ["core"] } }),
    entry({
      kind: "Website",
      metadata: { name: "marketing-site", description: "Public site.", tags: [] },
      spec: { lifecycle: "staging", owner: "team-marketing", dependsOn: [] },
    }),
  ];

  it("returns every entry when no filters are set", () => {
    expect(filterCatalogEntries(entries, { q: "", kind: "", lifecycle: "" })).toHaveLength(2);
  });

  it("filters by kind", () => {
    const result = filterCatalogEntries(entries, { q: "", kind: "Website", lifecycle: "" });
    expect(result.map((e) => e.metadata.name)).toEqual(["marketing-site"]);
  });

  it("filters by lifecycle", () => {
    const result = filterCatalogEntries(entries, { q: "", kind: "", lifecycle: "production" });
    expect(result.map((e) => e.metadata.name)).toEqual(["user-service"]);
  });

  it("matches the search term against name, description, owner, and tags", () => {
    expect(filterCatalogEntries(entries, { q: "core", kind: "", lifecycle: "" })).toHaveLength(1);
    expect(filterCatalogEntries(entries, { q: "team-marketing", kind: "", lifecycle: "" })).toHaveLength(1);
    expect(filterCatalogEntries(entries, { q: "public", kind: "", lifecycle: "" })).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(filterCatalogEntries(entries, { q: "USER", kind: "", lifecycle: "" })).toHaveLength(1);
  });

  it("combines filters with AND semantics", () => {
    const result = filterCatalogEntries(entries, { q: "site", kind: "Service", lifecycle: "" });
    expect(result).toHaveLength(0);
  });

  it("returns no matches when nothing satisfies the filters", () => {
    expect(filterCatalogEntries(entries, { q: "nonexistent", kind: "", lifecycle: "" })).toHaveLength(0);
  });
});
