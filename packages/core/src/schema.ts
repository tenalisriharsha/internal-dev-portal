import { z } from "zod";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const OnCallSchema = z
  .object({
    provider: z.enum(["pagerduty", "opsgenie", "none"]).default("none"),
    rotation: z.string().optional(),
    slack: z.string().optional(),
  })
  .strict();

export const LifecycleSchema = z.enum([
  "experimental",
  "staging",
  "production",
  "deprecated",
]);

export const CatalogEntrySchema = z
  .object({
    apiVersion: z.literal("idp.dev/v1"),
    kind: z.enum(["Service", "Website", "Library"]),
    metadata: z
      .object({
        name: z
          .string()
          .regex(slugPattern, "name must be a lowercase-hyphenated slug"),
        description: z.string().min(1),
        tags: z.array(z.string()).default([]),
      })
      .strict(),
    spec: z
      .object({
        lifecycle: LifecycleSchema,
        owner: z.string().min(1),
        dependsOn: z.array(z.string()).default([]),
        oncall: OnCallSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type OnCall = z.infer<typeof OnCallSchema>;
export type Lifecycle = z.infer<typeof LifecycleSchema>;
