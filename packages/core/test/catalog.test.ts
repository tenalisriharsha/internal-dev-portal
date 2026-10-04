import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Catalog } from "../src/catalog";

let tmpDir: string;

async function writeService(
  root: string,
  name: string,
  contents: string,
): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "catalog-info.yaml"), contents, "utf8");
}

const goodYaml = (name: string, dependsOn: string[] = []) => `
apiVersion: idp.dev/v1
kind: Service
metadata:
  name: ${name}
  description: Example service ${name}.
spec:
  lifecycle: production
  owner: team-example
  dependsOn: [${dependsOn.join(", ")}]
`;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-catalog-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("Catalog.loadFromDirectories", () => {
  it("loads valid services and lists them sorted by name", async () => {
    await writeService(tmpDir, "zeta-service", goodYaml("zeta-service"));
    await writeService(tmpDir, "alpha-service", goodYaml("alpha-service"));

    const catalog = await Catalog.loadFromDirectories([tmpDir]);

    expect(catalog.errors).toEqual([]);
    expect(catalog.size).toBe(2);
    expect(catalog.list().map((e) => e.metadata.name)).toEqual([
      "alpha-service",
      "zeta-service",
    ]);
  });

  it("returns undefined for a service that does not exist", async () => {
    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    expect(catalog.get("nope")).toBeUndefined();
    expect(catalog.has("nope")).toBe(false);
  });

  it("records a validation error for malformed YAML without throwing", async () => {
    await writeService(tmpDir, "broken-service", "not: [valid: yaml::");

    const catalog = await Catalog.loadFromDirectories([tmpDir]);

    expect(catalog.size).toBe(0);
    expect(catalog.errors).toHaveLength(1);
    expect(catalog.errors[0].message).toMatch(/invalid YAML/);
  });

  it("records a validation error for a schema violation", async () => {
    await writeService(
      tmpDir,
      "bad-schema",
      `
apiVersion: idp.dev/v1
kind: Service
metadata:
  name: Bad_Name
  description: oops
spec:
  lifecycle: production
  owner: team-example
`,
    );

    const catalog = await Catalog.loadFromDirectories([tmpDir]);

    expect(catalog.size).toBe(0);
    expect(catalog.errors).toHaveLength(1);
    expect(catalog.errors[0].message).toMatch(/name/);
  });

  it("records an error on duplicate service names across files", async () => {
    await writeService(tmpDir, "first-copy", goodYaml("duplicate-name"));
    await writeService(tmpDir, "second-copy", goodYaml("duplicate-name"));

    const catalog = await Catalog.loadFromDirectories([tmpDir]);

    expect(catalog.size).toBe(1);
    expect(catalog.errors).toHaveLength(1);
    expect(catalog.errors[0].message).toMatch(/duplicate service name/);
  });

  it("merges services from multiple root directories", async () => {
    const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-catalog-2-"));
    try {
      await writeService(tmpDir, "service-a", goodYaml("service-a"));
      await writeService(otherDir, "service-b", goodYaml("service-b"));

      const catalog = await Catalog.loadFromDirectories([tmpDir, otherDir]);

      expect(catalog.size).toBe(2);
    } finally {
      await fs.rm(otherDir, { recursive: true, force: true });
    }
  });

  it("tolerates a root directory that does not exist", async () => {
    const catalog = await Catalog.loadFromDirectories([
      path.join(tmpDir, "does-not-exist"),
    ]);
    expect(catalog.size).toBe(0);
    expect(catalog.errors).toEqual([]);
  });

  it("computes dependents of a service", async () => {
    await writeService(tmpDir, "user-service", goodYaml("user-service"));
    await writeService(
      tmpDir,
      "checkout-web",
      goodYaml("checkout-web", ["user-service"]),
    );

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    const dependents = catalog.getDependents("user-service");

    expect(dependents.map((e) => e.metadata.name)).toEqual(["checkout-web"]);
  });
});
