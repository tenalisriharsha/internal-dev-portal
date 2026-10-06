import { escapeHtml } from "./escape";

const LIFECYCLE_STATUS: Record<string, "good" | "warning" | "serious" | "critical"> = {
  production: "good",
  staging: "warning",
  experimental: "serious",
  deprecated: "critical",
};

/** Renders a lifecycle badge with both a status color and a text label, never color alone. */
export function lifecycleBadge(lifecycle: string): string {
  const status = LIFECYCLE_STATUS[lifecycle] ?? "serious";
  return `<span class="badge badge--${status}">${escapeHtml(lifecycle)}</span>`;
}

export function kindBadge(kind: string): string {
  return `<span class="badge badge--kind">${escapeHtml(kind)}</span>`;
}

/** Renders an open-incident count: 0 is good, 1 is a warning, 2+ is critical. */
export function healthBadge(openIncidents: number): string {
  const status = openIncidents === 0 ? "good" : openIncidents === 1 ? "warning" : "critical";
  const label = `${openIncidents} open incident${openIncidents === 1 ? "" : "s"}`;
  return `<span class="badge badge--${status}">${escapeHtml(label)}</span>`;
}
