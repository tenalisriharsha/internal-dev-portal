import type { CatalogEntry } from "@idp/core";
import { lifecycleBadge, kindBadge } from "./badges";
import { escapeHtml } from "./escape";

export function renderServiceCard(entry: CatalogEntry): string {
  return `
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
      </a>`;
}
