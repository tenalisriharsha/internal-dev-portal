import type { CatalogEntry, ValidationIssue } from "@idp/core";
import { lifecycleBadge, kindBadge } from "./badges";
import { escapeHtml } from "./escape";
import { layout } from "./layout";

export function renderCatalogList(
  entries: CatalogEntry[],
  errors: ValidationIssue[] = [],
  refreshedAt: string | null = null,
): string {
  const rows = entries
    .map(
      (entry) => `
      <a class="service-card" href="/services/${encodeURIComponent(entry.metadata.name)}">
        <div class="service-card__header">
          <h3>${escapeHtml(entry.metadata.name)}</h3>
          ${kindBadge(entry.kind)}
        </div>
        <p class="service-card__description">${escapeHtml(entry.metadata.description)}</p>
        <div class="service-card__meta">
          ${lifecycleBadge(entry.spec.lifecycle)}
          <span class="service-card__owner">owner: ${escapeHtml(entry.spec.owner)}</span>
          ${
            entry.spec.dependsOn.length > 0
              ? `<span class="service-card__deps">${entry.spec.dependsOn.length} dependenc${entry.spec.dependsOn.length === 1 ? "y" : "ies"}</span>`
              : ""
          }
        </div>
      </a>`,
    )
    .join("");

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
