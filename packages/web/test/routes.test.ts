import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import type { AppOptions } from "../src/options";

let catalogDir: string;
let generatedDir: string;
let templateDir: string;
let app: Express;

async function writeExampleService(name: string, dependsOn: string[] = []): Promise<void> {
  const dir = path.join(catalogDir, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "catalog-info.yaml"),
    `
apiVersion: idp.dev/v1
kind: Service
metadata:
  name: ${name}
  description: Example service ${name}.
spec:
  lifecycle: production
  owner: team-example
  dependsOn: [${dependsOn.join(", ")}]
  oncall:
    provider: pagerduty
    rotation: ${name}-primary
`,
    "utf8",
  );
}

beforeEach(async () => {
  catalogDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-catalog-"));
  generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-generated-"));
  templateDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-template-"));

  await fs.writeFile(
    path.join(templateDir, "catalog-info.yaml.tmpl"),
    `apiVersion: idp.dev/v1
kind: Service
metadata:
  name: {{name}}
  description: {{description}}
spec:
  lifecycle: {{lifecycle}}
  owner: {{owner}}
  dependsOn: {{dependsOnYaml}}
`,
    "utf8",
  );
  await fs.writeFile(path.join(templateDir, "README.md.tmpl"), "# {{name}}\n", "utf8");

  const options: AppOptions = {
    repoRoot: os.tmpdir(),
    catalogDirs: [catalogDir, generatedDir],
    templateDir,
    generatedDir,
  };
  app = createApp(options);
});

afterEach(async () => {
  await fs.rm(catalogDir, { recursive: true, force: true });
  await fs.rm(generatedDir, { recursive: true, force: true });
  await fs.rm(templateDir, { recursive: true, force: true });
});

describe("GET /", () => {
  it("lists registered services", async () => {
    await writeExampleService("user-service");

    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.text).toContain("user-service");
    expect(res.text).toContain("1 service registered");
  });

  it("shows an empty state when no services exist", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("No services registered yet");
  });
});

describe("GET /services/:name", () => {
  it("renders ownership, on-call, and dependency info", async () => {
    await writeExampleService("user-service");
    await writeExampleService("checkout-web", ["user-service"]);

    const res = await request(app).get("/services/checkout-web");

    expect(res.status).toBe(200);
    expect(res.text).toContain("team-example");
    expect(res.text).toContain("pagerduty");
    expect(res.text).toContain("checkout-web-primary");
    expect(res.text).toContain("user-service");
  });

  it("lists reverse dependents on the depended-upon service", async () => {
    await writeExampleService("user-service");
    await writeExampleService("checkout-web", ["user-service"]);

    const res = await request(app).get("/services/user-service");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Depended on by (1)");
    expect(res.text).toContain("checkout-web");
  });

  it("returns 404 for an unknown service", async () => {
    const res = await request(app).get("/services/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Service not found");
  });
});

describe("GET /graph", () => {
  it("renders an svg with a node per service", async () => {
    await writeExampleService("user-service");
    await writeExampleService("checkout-web", ["user-service"]);

    const res = await request(app).get("/graph");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<svg");
    expect(res.text).toContain(">user-service<");
    expect(res.text).toContain(">checkout-web<");
  });
});

describe("GET /create", () => {
  it("renders the create-service form", async () => {
    const res = await request(app).get("/create");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Create New Service");
    expect(res.text).toContain('name="name"');
  });
});

describe("POST /create", () => {
  it("scaffolds a new service and registers it in the catalog", async () => {
    await writeExampleService("user-service");

    const createRes = await request(app).post("/create").type("form").send({
      name: "billing-service",
      description: "Handles billing.",
      owner: "team-billing",
      lifecycle: "experimental",
      dependsOn: "user-service",
    });

    expect(createRes.status).toBe(200);
    expect(createRes.text).toContain("Service created");
    expect(createRes.text).toContain("billing-service");

    const generatedFile = await fs.readFile(
      path.join(generatedDir, "billing-service", "catalog-info.yaml"),
      "utf8",
    );
    expect(generatedFile).toContain("name: billing-service");
    expect(generatedFile).toContain("dependsOn: [user-service]");

    const listRes = await request(app).get("/");
    expect(listRes.text).toContain("billing-service");

    const detailRes = await request(app).get("/services/billing-service");
    expect(detailRes.status).toBe(200);
  });

  it("rejects a name that collides with an existing service", async () => {
    await writeExampleService("user-service");

    const res = await request(app).post("/create").type("form").send({
      name: "user-service",
      description: "Duplicate.",
      owner: "team-example",
      lifecycle: "experimental",
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain("already exists");
  });

  it("rejects an invalid service name and does not touch the filesystem", async () => {
    const res = await request(app).post("/create").type("form").send({
      name: "Not A Valid Name",
      description: "x",
      owner: "team-example",
      lifecycle: "experimental",
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Could not create service");

    const exists = await fs
      .access(path.join(generatedDir, "Not A Valid Name"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("ignores dependsOn values that are not real services", async () => {
    const res = await request(app).post("/create").type("form").send({
      name: "lonely-service",
      description: "x",
      owner: "team-example",
      lifecycle: "experimental",
      dependsOn: "ghost-service",
    });

    expect(res.status).toBe(200);
    const generatedFile = await fs.readFile(
      path.join(generatedDir, "lonely-service", "catalog-info.yaml"),
      "utf8",
    );
    expect(generatedFile).toContain("dependsOn: []");
  });
});

describe("unknown routes", () => {
  it("returns a 404 page", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
