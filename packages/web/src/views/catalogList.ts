import type { CatalogEntry, ValidationIssue } from "@idp/core";
import { escapeHtml } from "./escape";
import { layout } from "./layout";
import { renderServiceCard } from "./serviceCard";

export function renderCatalogList(
  entries: CatalogEntry[],
  errors: ValidationIssue[] = [],
  refreshedAt: string | null = null,
): string {
  const rows = entries.map(renderServiceCard).join("");

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

  const body = `
    <div class="page-header">
      <h1>Service Catalog</h1>
      <p class="page-subtitle">${entries.length} service${entries.length === 1 ? "" : "s"} registered from <code>catalog-info.yaml</code> metadata across every repo.</p>
      <div class="catalog-meta">
        <span class="catalog-meta__refreshed">${escapeHtml(refreshedLabel)}</span>
        <form method="post" action="/admin/refresh?redirectTo=%2F">
          <button type="submit" class="btn-secondary btn-small">Refresh now</button>
        </form>
      </div>
    </div>
    ${errorBanner}
    <div class="service-grid">
      ${rows || '<p class="empty-state">No services registered yet. Use "Create New Service" to add the first one.</p>'}
    </div>`;

  return layout("Catalog", body, "/");
}
