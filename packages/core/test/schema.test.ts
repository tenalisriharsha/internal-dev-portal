import { describe, expect, it } from "vitest";
import { CatalogEntrySchema } from "../src/schema";

function validEntry() {
  return {
    apiVersion: "idp.dev/v1",
    kind: "Service",
    metadata: {
      name: "payments-service",
      description: "Handles payment processing.",
      tags: ["payments", "core"],
    },
    spec: {
      lifecycle: "production",
      owner: "team-payments",
      dependsOn: ["user-service"],
      oncall: { provider: "pagerduty", rotation: "payments-primary" },
    },
  };
}

describe("CatalogEntrySchema", () => {
  it("accepts a fully populated, valid entry", () => {
    const result = CatalogEntrySchema.safeParse(validEntry());
    expect(result.success).toBe(true);
  });

  it("accepts an entry without optional fields, applying defaults", () => {
    const entry = validEntry();
    delete (entry.metadata as Record<string, unknown>).tags;
    delete (entry.spec as Record<string, unknown>).dependsOn;
    delete (entry.spec as Record<string, unknown>).oncall;

    const result = CatalogEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.tags).toEqual([]);
      expect(result.data.spec.dependsOn).toEqual([]);
    }
  });

  it("rejects a name that is not a lowercase-hyphenated slug", () => {
    const entry = validEntry();
    entry.metadata.name = "Payments_Service";
    const result = CatalogEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown lifecycle value", () => {
    const entry = validEntry();
    (entry.spec as Record<string, unknown>).lifecycle = "sandbox";
    const result = CatalogEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it("rejects an entry missing a required field", () => {
    const entry = validEntry();
    delete (entry.spec as Record<string, unknown>).owner;
    const result = CatalogEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const entry = { ...validEntry(), extra: "nope" };
    const result = CatalogEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported apiVersion", () => {
    const entry = { ...validEntry(), apiVersion: "idp.dev/v2" };
    const result = CatalogEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});
