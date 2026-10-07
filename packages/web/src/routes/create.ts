import path from "node:path";
import { CatalogEntrySchema, renderTemplate } from "@idp/core";
import { Router } from "express";
import type { AppOptions } from "../options";
import { readCatalog } from "../catalogView";
import { renderCreateForm, type CreateFormValues } from "../views/createForm";
import { renderCreateSuccess } from "../views/createSuccess";

function normalizeDependsOn(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string" && raw.length > 0) return [raw];
  return [];
}

type Kind = "Service" | "Website" | "Library";

export function createCreateRouter(options: AppOptions): Router {
  const router = Router();

  router.get("/create", (_req, res) => {
    const catalog = readCatalog(options);
    res.send(
      renderCreateForm(catalog.list(), {
        name: "",
        description: "",
        owner: "",
        kind: "Service",
        lifecycle: "experimental",
        dependsOn: [],
      }),
    );
  });

  router.post("/create", async (req, res) => {
    const catalog = readCatalog(options);

    const submitted: CreateFormValues = {
      name: typeof req.body.name === "string" ? req.body.name.trim() : "",
      description: typeof req.body.description === "string" ? req.body.description.trim() : "",
      owner: typeof req.body.owner === "string" ? req.body.owner.trim() : "",
      kind: typeof req.body.kind === "string" ? req.body.kind : "Service",
      lifecycle: typeof req.body.lifecycle === "string" ? req.body.lifecycle : "experimental",
      dependsOn: normalizeDependsOn(req.body.dependsOn).filter((dep) => catalog.has(dep)),
    };

    const errors: string[] = [];

    if (catalog.has(submitted.name)) {
      errors.push(`a service named "${submitted.name}" already exists in the catalog`);
    }

    const candidate = {
      apiVersion: "idp.dev/v1" as const,
      kind: submitted.kind as Kind,
      metadata: {
        name: submitted.name,
        description: submitted.description,
        tags: [] as string[],
      },
      spec: {
        lifecycle: submitted.lifecycle as "experimental" | "staging" | "production" | "deprecated",
        owner: submitted.owner,
        dependsOn: submitted.dependsOn,
      },
    };

    const validation = CatalogEntrySchema.safeParse(candidate);
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        errors.push(`${issue.path.join(".") || "entry"}: ${issue.message}`);
      }
    }

    if (errors.length > 0) {
      res.status(400).send(renderCreateForm(catalog.list(), submitted, errors));
      return;
    }

    const outputDir = path.join(options.generatedDir, submitted.name);
    const templateDir = options.templateDirs[submitted.kind as Kind];
    try {
      const files = await renderTemplate(templateDir, outputDir, {
        name: submitted.name,
        description: submitted.description,
        owner: submitted.owner,
        lifecycle: submitted.lifecycle,
        dependsOnYaml: `[${submitted.dependsOn.join(", ")}]`,
      });
      await options.store.refresh(options.sources);
      const relativeFiles = files.map((file) => path.relative(options.repoRoot, file));
      res.send(renderCreateSuccess(submitted.name, relativeFiles));
    } catch (err) {
      res
        .status(500)
        .send(renderCreateForm(catalog.list(), submitted, [`failed to scaffold service: ${String(err)}`]));
    }
  });

  return router;
}
