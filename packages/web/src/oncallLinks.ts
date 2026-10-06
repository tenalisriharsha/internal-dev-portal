import type { OnCall } from "@idp/core";

export interface EscalationConfig {
  /** PagerDuty account subdomain, e.g. "acme" for acme.pagerduty.com. */
  pagerdutySubdomain?: string;
  /** Opsgenie organization slug, e.g. "acme" for acme.app.opsgenie.com. */
  opsgenieOrg?: string;
}

/**
 * Builds a deep link into the on-call provider's schedule search for a rotation.
 * Returns undefined when the provider isn't configured with a subdomain/org, or
 * when there's no rotation to search for — callers fall back to plain text.
 */
export function escalationUrl(oncall: OnCall, config: EscalationConfig): string | undefined {
  if (!oncall.rotation) return undefined;

  if (oncall.provider === "pagerduty" && config.pagerdutySubdomain) {
    return `https://${config.pagerdutySubdomain}.pagerduty.com/schedules#/search?query=${encodeURIComponent(oncall.rotation)}`;
  }

  if (oncall.provider === "opsgenie" && config.opsgenieOrg) {
    return `https://${config.opsgenieOrg}.app.opsgenie.com/schedules?searchQuery=${encodeURIComponent(oncall.rotation)}`;
  }

  return undefined;
}
