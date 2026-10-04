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
