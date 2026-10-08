import type { CatalogEntry, ValidationIssue } from "@idp/core";
import type { CatalogFilters } from "../catalogView";
import { escapeHtml } from "./escape";
import { layout } from "./layout";
import { renderServiceCard } from "./serviceCard";

const KINDS = ["Service", "Website", "Library"];
const LIFECYCLES = ["experimental", "staging", "production", "deprecated"];

function optionsFor(values: string[], selected: string): string {
  const blank = `<option value="" ${selected === "" ? "selected" : ""}>Any</option>`;
  const rest = values
    .map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${value}</option>`)
    .join("");
  return blank + rest;
}

const EMPTY_FILTERS: CatalogFilters = { q: "", kind: "", lifecycle: "" };

export function renderCatalogList(
  entries: CatalogEntry[],
  errors: ValidationIssue[] = [],
  refreshedAt: string | null = null,
  filters: CatalogFilters = EMPTY_FILTERS,
  totalCount: number = entries.length,
): string {
  const rows = entries.map(renderServiceCard).join("");
  const filtersActive = filters.q !== "" || filters.kind !== "" || filters.lifecycle !== "";

  const errorBanner =
    errors.length > 0
      ? `<div class="error-banner">
          <strong>${errors.length} catalog file${errors.length === 1 ? "" : "s"} failed validation and ${errors.length === 1 ? "was" : "were"} skipped:</strong>
          <ul>${errors.map((issue) => `<li><code>${escapeHtml(issue.file)}</code> &mdash; ${escapeHtml(issue.message)}</li>`).join("")}</ul>
        </div>`
      : "";

  const refreshedLabel = refreshedAt
    ? `Last refreshed ${new Date(refreshedAt).toLocaleString()}`
    : "Not yet refreshed";

  const countLabel = filtersActive
    ? `${entries.length} of ${totalCount} service${totalCount === 1 ? "" : "s"} match`
    : `${totalCount} service${totalCount === 1 ? "" : "s"} registered from <code>catalog-info.yaml</code> metadata across every repo.`;

  const emptyState =
    totalCount === 0
      ? '<p class="empty-state">No services registered yet. Use "Create New Service" to add the first one.</p>'
      : '<p class="empty-state">No services match these filters. <a href="/">Clear filters</a>.</p>';

  const body = `
    <div class="page-header">
      <h1>Service Catalog</h1>
      <p class="page-subtitle">${countLabel}</p>
      <div class="catalog-meta">
        <span class="catalog-meta__refreshed">${escapeHtml(refreshedLabel)}</span>
        <form method="post" action="/admin/refresh?redirectTo=%2F">
          <button type="submit" class="btn-secondary btn-small">Refresh now</button>
        </form>
      </div>
    </div>
    <form class="filter-bar" method="get" action="/">
      <label class="form-field">
        <span>Search</span>
        <input type="text" name="q" placeholder="name, description, owner, tag…" value="${escapeHtml(filters.q)}" />
      </label>
      <label class="form-field">
        <span>Kind</span>
        <select name="kind">${optionsFor(KINDS, filters.kind)}</select>
      </label>
      <label class="form-field">
        <span>Lifecycle</span>
        <select name="lifecycle">${optionsFor(LIFECYCLES, filters.lifecycle)}</select>
      </label>
      <button type="submit" class="btn-primary btn-small">Filter</button>
      ${filtersActive ? '<a class="btn-secondary btn-small" href="/">Clear</a>' : ""}
    </form>
    ${errorBanner}
    <div class="service-grid">
      ${rows || emptyState}
    </div>`;

  return layout("Catalog", body, "/");
}
