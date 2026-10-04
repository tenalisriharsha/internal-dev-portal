import type { CatalogEntry } from "@idp/core";
import { lifecycleBadge, kindBadge } from "./badges";
import { escapeHtml } from "./escape";
import { layout } from "./layout";

export function renderCatalogList(entries: CatalogEntry[]): string {
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

  const body = `
    <div class="page-header">
      <h1>Service Catalog</h1>
      <p class="page-subtitle">${entries.length} service${entries.length === 1 ? "" : "s"} registered from <code>catalog-info.yaml</code> metadata across every repo.</p>
    </div>
    <div class="service-grid">
      ${rows || '<p class="empty-state">No services registered yet. Use "Create New Service" to add the first one.</p>'}
    </div>`;

  return layout("Catalog", body, "/");
}
