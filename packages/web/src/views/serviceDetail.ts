import type { CatalogEntry } from "@idp/core";
import { lifecycleBadge, kindBadge } from "./badges";
import { escapeHtml } from "./escape";
import { layout } from "./layout";

function serviceLink(name: string): string {
  return `<a class="pill-link" href="/services/${encodeURIComponent(name)}">${escapeHtml(name)}</a>`;
}

export function renderServiceDetail(
  entry: CatalogEntry,
  dependents: CatalogEntry[],
  sourceFile: string | undefined,
): string {
  const oncall = entry.spec.oncall;

  const body = `
    <div class="page-header">
      <a class="back-link" href="/">&larr; Back to catalog</a>
      <div class="detail-title">
        <h1>${escapeHtml(entry.metadata.name)}</h1>
        ${kindBadge(entry.kind)}
        ${lifecycleBadge(entry.spec.lifecycle)}
      </div>
      <p class="page-subtitle">${escapeHtml(entry.metadata.description)}</p>
    </div>

    <div class="detail-grid">
      <section class="panel">
        <h2>Ownership</h2>
        <dl class="kv-list">
          <dt>Owning team</dt>
          <dd>${escapeHtml(entry.spec.owner)}</dd>
          <dt>Source</dt>
          <dd><code>${escapeHtml(sourceFile ?? "unknown")}</code></dd>
        </dl>
      </section>

      <section class="panel">
        <h2>On-call</h2>
        ${
          oncall && oncall.provider !== "none"
            ? `<dl class="kv-list">
                <dt>Provider</dt>
                <dd>${escapeHtml(oncall.provider)}</dd>
                ${oncall.rotation ? `<dt>Rotation</dt><dd>${escapeHtml(oncall.rotation)}</dd>` : ""}
                ${oncall.slack ? `<dt>Slack</dt><dd>${escapeHtml(oncall.slack)}</dd>` : ""}
              </dl>`
            : '<p class="empty-state">No on-call rotation configured.</p>'
        }
      </section>

      <section class="panel">
        <h2>Depends on (${entry.spec.dependsOn.length})</h2>
        ${
          entry.spec.dependsOn.length > 0
            ? `<ul class="pill-list">${entry.spec.dependsOn.map((dep) => `<li>${serviceLink(dep)}</li>`).join("")}</ul>`
            : '<p class="empty-state">No upstream dependencies.</p>'
        }
      </section>

      <section class="panel">
        <h2>Depended on by (${dependents.length})</h2>
        ${
          dependents.length > 0
            ? `<ul class="pill-list">${dependents.map((dep) => `<li>${serviceLink(dep.metadata.name)}</li>`).join("")}</ul>`
            : '<p class="empty-state">No other services depend on this one.</p>'
        }
      </section>
    </div>`;

  return layout(entry.metadata.name, body);
}

export function renderServiceNotFound(name: string): string {
  const body = `
    <div class="page-header">
      <a class="back-link" href="/">&larr; Back to catalog</a>
      <h1>Service not found</h1>
      <p class="page-subtitle">No service named <code>${escapeHtml(name)}</code> is registered in the catalog.</p>
    </div>`;
  return layout("Not found", body);
}
