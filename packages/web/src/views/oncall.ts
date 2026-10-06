import type { OnCall } from "@idp/core";
import { escalationUrl, type EscalationConfig } from "../oncallLinks";
import { escapeHtml } from "./escape";

/**
 * Renders a rotation name as a deep link into the configured on-call provider
 * when one is available, otherwise as plain escaped text.
 */
export function renderRotation(oncall: OnCall, escalation: EscalationConfig): string {
  if (!oncall.rotation) return "";

  const url = escalationUrl(oncall, escalation);
  if (!url) return escapeHtml(oncall.rotation);

  return `<a class="pill-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(oncall.rotation)} &#8599;</a>`;
}
