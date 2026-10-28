import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderTemplate } from "../src/template";
import { CatalogEntrySchema } from "../src/schema";

let templateDir: string;
let outputRoot: string;

beforeEach(async () => {
  templateDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-template-src-"));
  outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "idp-template-out-"));

  await fs.writeFile(
    path.join(templateDir, "catalog-info.yaml.tmpl"),
    "name: {{name}}\nowner: {{owner}}\nlifecycle: {{lifecycle}}\n",
    "utf8",
  );
  await fs.mkdir(path.join(templateDir, "src"));
  await fs.writeFile(
    path.join(templateDir, "src", "index.ts.tmpl"),
    "// {{description}}\nexport const name = \"{{name}}\";\n",
    "utf8",
  );
  await fs.writeFile(path.join(templateDir, "README.md"), "# static file\n", "utf8");
});

afterEach(async () => {
  await fs.rm(templateDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
});

describe("renderTemplate", () => {
  it("substitutes variables and strips the .tmpl suffix", async () => {
    const outputDir = path.join(outputRoot, "new-service");
    const written = await renderTemplate(templateDir, outputDir, {
      name: "new-service",
      description: "A brand new service.",
      owner: "team-example",
      lifecycle: "experimental",
    });

    expect(written.sort()).toEqual(
      [
        path.join(outputDir, "catalog-info.yaml"),
        path.join(outputDir, "src", "index.ts"),
        path.join(outputDir, "README.md"),
      ].sort(),
    );

    const catalogInfo = await fs.readFile(
      path.join(outputDir, "catalog-info.yaml"),
      "utf8",
    );
    expect(yaml.load(catalogInfo)).toEqual({
      name: "new-service",
      owner: "team-example",
      lifecycle: "experimental",
    });

    const indexTs = await fs.readFile(path.join(outputDir, "src", "index.ts"), "utf8");
    expect(indexTs).toContain("A brand new service.");
    expect(indexTs).toContain('export const name = "new-service";');

    const readme = await fs.readFile(path.join(outputDir, "README.md"), "utf8");
    expect(readme).toBe("# static file\n");
  });

  it("escapes YAML-significant characters in substituted values so the output parses", async () => {
    await fs.writeFile(
      path.join(templateDir, "catalog-info.yaml.tmpl"),
      [
        "apiVersion: idp.dev/v1",
        "kind: Service",
        "metadata:",
        "  name: {{name}}",
        "  description: {{description}}",
        "spec:",
        "  lifecycle: {{lifecycle}}",
        "  owner: {{owner}}",
        "  dependsOn: {{dependsOnYaml}}",
        "",
      ].join("\n"),
      "utf8",
    );

    const outputDir = path.join(outputRoot, "orders-service");
    await renderTemplate(templateDir, outputDir, {
      name: "orders-service",
      description: "Handles orders: fast, reliable, and #1 in reviews.",
      owner: "team-orders",
      lifecycle: "experimental",
      dependsOnYaml: "[]",
    });

    const catalogInfo = await fs.readFile(path.join(outputDir, "catalog-info.yaml"), "utf8");
    const parsed = yaml.load(catalogInfo);
    const result = CatalogEntrySchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.description).toBe(
        "Handles orders: fast, reliable, and #1 in reviews.",
      );
    }
  });

  it("refuses to overwrite an existing output directory", async () => {
    const outputDir = path.join(outputRoot, "existing-service");
    await fs.mkdir(outputDir, { recursive: true });

    await expect(
      renderTemplate(templateDir, outputDir, {
        name: "existing-service",
        description: "x",
        owner: "team-example",
        lifecycle: "experimental",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("throws when the template references an unknown variable", async () => {
    await fs.writeFile(
      path.join(templateDir, "extra.tmpl"),
      "{{unknownVariable}}",
      "utf8",
    );
    const outputDir = path.join(outputRoot, "broken-service");

    await expect(
      renderTemplate(templateDir, outputDir, {
        name: "broken-service",
        description: "x",
        owner: "team-example",
        lifecycle: "experimental",
      }),
    ).rejects.toThrow(/unknown variable/);
  });
});
