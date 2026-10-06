import { describe, expect, it } from "vitest";
import { escalationUrl } from "../src/oncallLinks";

describe("escalationUrl", () => {
  it("builds a pagerduty schedule search link when a subdomain is configured", () => {
    const url = escalationUrl(
      { provider: "pagerduty", rotation: "payments-primary" },
      { pagerdutySubdomain: "acme" },
    );
    expect(url).toBe("https://acme.pagerduty.com/schedules#/search?query=payments-primary");
  });

  it("builds an opsgenie schedule search link when an org is configured", () => {
    const url = escalationUrl(
      { provider: "opsgenie", rotation: "checkout-primary" },
      { opsgenieOrg: "acme" },
    );
    expect(url).toBe("https://acme.app.opsgenie.com/schedules?searchQuery=checkout-primary");
  });

  it("returns undefined when the matching provider isn't configured", () => {
    const url = escalationUrl({ provider: "pagerduty", rotation: "payments-primary" }, {});
    expect(url).toBeUndefined();
  });

  it("returns undefined when the provider is 'none'", () => {
    const url = escalationUrl(
      { provider: "none", rotation: "payments-primary" },
      { pagerdutySubdomain: "acme", opsgenieOrg: "acme" },
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when there is no rotation to search for", () => {
    const url = escalationUrl({ provider: "pagerduty" }, { pagerdutySubdomain: "acme" });
    expect(url).toBeUndefined();
  });

  it("encodes rotation names that contain special characters", () => {
    const url = escalationUrl(
      { provider: "pagerduty", rotation: "team a/primary" },
      { pagerdutySubdomain: "acme" },
    );
    expect(url).toBe("https://acme.pagerduty.com/schedules#/search?query=team%20a%2Fprimary");
  });
});
