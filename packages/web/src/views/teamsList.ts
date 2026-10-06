import type { CatalogEntry } from "@idp/core";
import { healthBadge } from "./badges";
import { escapeHtml } from "./escape";
import { layout } from "./layout";

export interface TeamSummary {
  owner: string;
  services: CatalogEntry[];
}

function openIncidentsFor(services: CatalogEntry[]): number {
  return services.reduce((sum, service) => sum + (service.spec.health?.openIncidents ?? 0), 0);
}

function rotationCountFor(services: CatalogEntry[]): number {
  const rotations = new Set(
    services
      .map((service) => service.spec.oncall?.rotation)
      .filter((rotation): rotation is string => Boolean(rotation)),
  );
  return rotations.size;
}

export function renderTeamsList(teams: TeamSummary[]): string {
  const totalServices = teams.reduce((sum, team) => sum + team.services.length, 0);

  const cards = teams
    .map((team) => {
      const incidents = openIncidentsFor(team.services);
      const rotations = rotationCountFor(team.services);
      return `
      <a class="service-card" href="/teams/${encodeURIComponent(team.owner)}">
        <div class="service-card__header">
          <h3>${escapeHtml(team.owner)}</h3>
          <span class="badge badge--kind">${team.services.length} service${team.services.length === 1 ? "" : "s"}</span>
        </div>
        <div class="service-card__meta">
          ${healthBadge(incidents)}
          <span class="service-card__owner">${rotations} on-call rotation${rotations === 1 ? "" : "s"}</span>
        </div>
      </a>`;
    })
    .join("");

  const body = `
    <div class="page-header">
      <h1>Teams</h1>
      <p class="page-subtitle">${teams.length} team${teams.length === 1 ? "" : "s"} own${teams.length === 1 ? "s" : ""} ${totalServices} service${totalServices === 1 ? "" : "s"} across the catalog.</p>
    </div>
    <div class="service-grid">
      ${cards || '<p class="empty-state">No teams registered yet — services inherit their team from catalog-info.yaml\'s owner field.</p>'}
    </div>`;

  return layout("Teams", body, "/teams");
}
