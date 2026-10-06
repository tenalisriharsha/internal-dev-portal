import type { CatalogEntry, OnCall } from "@idp/core";
import type { EscalationConfig } from "../oncallLinks";
import { healthBadge } from "./badges";
import { escapeHtml } from "./escape";
import { layout } from "./layout";
import { renderRotation } from "./oncall";
import { renderServiceCard } from "./serviceCard";

function uniqueRotations(services: CatalogEntry[]): Array<{ service: string; oncall: OnCall }> {
  const seen = new Set<string>();
  const result: Array<{ service: string; oncall: OnCall }> = [];
  for (const service of services) {
    const oncall = service.spec.oncall;
    if (!oncall || oncall.provider === "none" || !oncall.rotation) continue;
    const key = `${oncall.provider}:${oncall.rotation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ service: service.metadata.name, oncall });
  }
  return result;
}

function mostRecentDeploy(services: CatalogEntry[]): string | undefined {
  const timestamps = services
    .map((service) => service.spec.health?.lastDeployAt)
    .filter((value): value is string => Boolean(value));
  if (timestamps.length === 0) return undefined;
  return timestamps.sort().at(-1);
}

export function renderTeamDetail(
  owner: string,
  services: CatalogEntry[],
  escalation: EscalationConfig,
): string {
  const totalIncidents = services.reduce(
    (sum, service) => sum + (service.spec.health?.openIncidents ?? 0),
    0,
  );
  const lastDeploy = mostRecentDeploy(services);
  const rotations = uniqueRotations(services);

  const body = `
    <div class="page-header">
      <a class="back-link" href="/teams">&larr; Back to teams</a>
      <h1>${escapeHtml(owner)}</h1>
      <p class="page-subtitle">${services.length} service${services.length === 1 ? "" : "s"} owned by this team.</p>
    </div>

    <div class="detail-grid">
      <section class="panel">
        <h2>On-call rotations</h2>
        ${
          rotations.length > 0
            ? `<dl class="kv-list">
                ${rotations
                  .map(
                    (entry) =>
                      `<dt>${escapeHtml(entry.service)}</dt><dd>${renderRotation(entry.oncall, escalation)}</dd>`,
                  )
                  .join("")}
              </dl>`
            : '<p class="empty-state">No on-call rotations configured for this team\'s services.</p>'
        }
      </section>

      <section class="panel">
        <h2>Health</h2>
        <dl class="kv-list">
          <dt>Open incidents</dt>
          <dd>${healthBadge(totalIncidents)}</dd>
          <dt>Most recent deploy</dt>
          <dd>${lastDeploy ? escapeHtml(new Date(lastDeploy).toLocaleString()) : "No deploys recorded"}</dd>
        </dl>
      </section>
    </div>

    <section class="panel panel--stacked">
      <h2>Services (${services.length})</h2>
      <div class="service-grid">
        ${services.map(renderServiceCard).join("")}
      </div>
    </section>`;

  return layout(owner, body, "/teams");
}

export function renderTeamNotFound(owner: string): string {
  const body = `
    <div class="page-header">
      <a class="back-link" href="/teams">&larr; Back to teams</a>
      <h1>Team not found</h1>
      <p class="page-subtitle">No services in the catalog are owned by <code>${escapeHtml(owner)}</code>.</p>
    </div>`;
  return layout("Not found", body, "/teams");
}
