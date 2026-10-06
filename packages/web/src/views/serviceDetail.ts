import type { CatalogEntry } from "@idp/core";
import type { EscalationConfig } from "../oncallLinks";
import { healthBadge, lifecycleBadge, kindBadge } from "./badges";
import { escapeHtml } from "./escape";
import { layout } from "./layout";
import { renderRotation } from "./oncall";

function serviceLink(name: string): string {
  return `<a class="pill-link" href="/services/${encodeURIComponent(name)}">${escapeHtml(name)}</a>`;
}

export function renderServiceDetail(
  entry: CatalogEntry,
  dependents: CatalogEntry[],
  sourceFile: string | undefined,
  escalation: EscalationConfig = {},
): string {
  const oncall = entry.spec.oncall;
  const health = entry.spec.health;

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
                ${oncall.rotation ? `<dt>Rotation</dt><dd>${renderRotation(oncall, escalation)}</dd>` : ""}
                ${oncall.slack ? `<dt>Slack</dt><dd>${escapeHtml(oncall.slack)}</dd>` : ""}
              </dl>`
            : '<p class="empty-state">No on-call rotation configured.</p>'
        }
      </section>

      <section class="panel">
        <h2>Health</h2>
        ${
          health
            ? `<dl class="kv-list">
                <dt>Open incidents</dt>
                <dd>${healthBadge(health.openIncidents)}</dd>
                <dt>Last deploy</dt>
                <dd>${health.lastDeployAt ? escapeHtml(new Date(health.lastDeployAt).toLocaleString()) : "No deploys recorded"}</dd>
              </dl>`
            : '<p class="empty-state">No health signal reported.</p>'
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
