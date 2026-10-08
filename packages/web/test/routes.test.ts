import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CatalogStore, LocalDirectorySource, type CatalogSource } from "@idp/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import type { AppOptions } from "../src/options";

let catalogDir: string;
let generatedDir: string;
let serviceTemplateDir: string;
let websiteTemplateDir: string;
let libraryTemplateDir: string;
let store: CatalogStore;
let sources: CatalogSource[];
let options: AppOptions;
let app: Express;

interface ServiceOverrides {
  owner?: string;
  health?: { lastDeployAt?: string; openIncidents?: number };
}

async function writeExampleService(
  name: string,
  dependsOn: string[] = [],
  overrides: ServiceOverrides = {},
): Promise<void> {
  const owner = overrides.owner ?? "team-example";
  const healthYaml = overrides.health
    ? `
  health:
${overrides.health.lastDeployAt ? `    lastDeployAt: "${overrides.health.lastDeployAt}"\n` : ""}${
        overrides.health.openIncidents !== undefined
          ? `    openIncidents: ${overrides.health.openIncidents}\n`
          : ""
      }`
    : "";

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
  owner: ${owner}
  dependsOn: [${dependsOn.join(", ")}]
  oncall:
    provider: pagerduty
    rotation: ${name}-primary
${healthYaml}`,
    "utf8",
  );
}

/** Refreshes the store the same way the scheduler/admin route would, outside of an HTTP request. */
async function refresh(): Promise<void> {
  await store.refresh(sources);
}

beforeEach(async () => {
  catalogDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-catalog-"));
  generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-generated-"));
  serviceTemplateDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-template-service-"));
  websiteTemplateDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-template-website-"));
  libraryTemplateDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-web-template-library-"));

  async function writeTemplate(dir: string, kind: string): Promise<void> {
    await fs.writeFile(
      path.join(dir, "catalog-info.yaml.tmpl"),
      `apiVersion: idp.dev/v1
kind: ${kind}
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
    await fs.writeFile(path.join(dir, "README.md.tmpl"), "# {{name}}\n", "utf8");
  }

  await writeTemplate(serviceTemplateDir, "Service");
  await writeTemplate(websiteTemplateDir, "Website");
  await writeTemplate(libraryTemplateDir, "Library");

  store = new CatalogStore(":memory:");
  sources = [new LocalDirectorySource(catalogDir), new LocalDirectorySource(generatedDir)];

  options = {
    repoRoot: os.tmpdir(),
    store,
    sources,
    templateDirs: {
      Service: serviceTemplateDir,
      Website: websiteTemplateDir,
      Library: libraryTemplateDir,
    },
    generatedDir,
  };
  app = createApp(options);
});

afterEach(async () => {
  store.close();
  await fs.rm(catalogDir, { recursive: true, force: true });
  await fs.rm(generatedDir, { recursive: true, force: true });
  await fs.rm(serviceTemplateDir, { recursive: true, force: true });
  await fs.rm(websiteTemplateDir, { recursive: true, force: true });
  await fs.rm(libraryTemplateDir, { recursive: true, force: true });
});

describe("GET /", () => {
  it("lists registered services", async () => {
    await writeExampleService("user-service");
    await refresh();

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

  it("shows 'Not yet refreshed' before any refresh has run", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain("Not yet refreshed");
  });

  it("does not pick up filesystem changes until an explicit refresh runs", async () => {
    const before = await request(app).get("/");
    expect(before.text).not.toContain("late-service");

    await writeExampleService("late-service");
    const stillBefore = await request(app).get("/");
    expect(stillBefore.text).not.toContain("late-service");

    await refresh();
    const after = await request(app).get("/");
    expect(after.text).toContain("late-service");
  });

  it("surfaces catalog validation errors in a banner", async () => {
    const dir = path.join(catalogDir, "broken-service");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "catalog-info.yaml"), "not: [valid: yaml::", "utf8");
    await refresh();

    const res = await request(app).get("/");
    expect(res.text).toContain("catalog file");
    expect(res.text).toContain("failed validation");
    expect(res.text).toMatch(/invalid YAML/);
  });

  it("filters by search term across name, description, and owner", async () => {
    await writeExampleService("user-service", [], { owner: "team-identity" });
    await writeExampleService("checkout-web", [], { owner: "team-checkout" });
    await refresh();

    const res = await request(app).get("/").query({ q: "team-checkout" });
    expect(res.text).toContain("checkout-web");
    expect(res.text).not.toContain(">user-service<");
    expect(res.text).toContain("1 of 2 services match");
  });

  it("filters by kind", async () => {
    await writeExampleService("user-service");
    await refresh();

    const res = await request(app).get("/").query({ kind: "Website" });
    expect(res.text).toContain("No services match these filters");
    expect(res.text).not.toContain(">user-service<");
  });

  it("filters by lifecycle", async () => {
    await writeExampleService("user-service");
    await refresh();

    const matching = await request(app).get("/").query({ lifecycle: "production" });
    expect(matching.text).toContain(">user-service<");

    const nonMatching = await request(app).get("/").query({ lifecycle: "deprecated" });
    expect(nonMatching.text).not.toContain(">user-service<");
  });

  it("preserves the submitted filter values in the form", async () => {
    await refresh();
    const res = await request(app).get("/").query({ q: "billing", kind: "Service", lifecycle: "staging" });
    expect(res.text).toContain('value="billing"');
    expect(res.text).toContain('<option value="Service" selected>Service</option>');
    expect(res.text).toContain('<option value="staging" selected>staging</option>');
  });
});

describe("GET /services/:name", () => {
  it("renders ownership, on-call, and dependency info", async () => {
    await writeExampleService("user-service");
    await writeExampleService("checkout-web", ["user-service"]);
    await refresh();

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
    await refresh();

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

  it("renders a health panel with open incidents and last deploy time", async () => {
    await writeExampleService("checkout-web", [], {
      health: { lastDeployAt: "2026-01-15T09:00:00Z", openIncidents: 2 },
    });
    await refresh();

    const res = await request(app).get("/services/checkout-web");

    expect(res.status).toBe(200);
    expect(res.text).toContain("2 open incidents");
  });

  it("shows a 'no health signal' empty state when health isn't reported", async () => {
    await writeExampleService("checkout-web");
    await refresh();

    const res = await request(app).get("/services/checkout-web");
    expect(res.text).toContain("No health signal reported");
  });

  it("links a rotation name to the on-call provider when escalation config is set", async () => {
    await writeExampleService("checkout-web");
    await refresh();

    const escalatingApp = createApp({ ...options, escalation: { pagerdutySubdomain: "acme" } });
    const res = await request(escalatingApp).get("/services/checkout-web");

    expect(res.text).toContain("https://acme.pagerduty.com/schedules#/search?query=checkout-web-primary");
  });

  it("falls back to plain text when no escalation config is set", async () => {
    await writeExampleService("checkout-web");
    await refresh();

    const res = await request(app).get("/services/checkout-web");
    expect(res.text).not.toContain("pagerduty.com/schedules");
    expect(res.text).toContain("checkout-web-primary");
  });
});

describe("GET /teams", () => {
  it("groups services by owner", async () => {
    await writeExampleService("user-service", [], { owner: "team-identity" });
    await writeExampleService("checkout-web", [], { owner: "team-checkout" });
    await writeExampleService("legacy-cart-service", [], { owner: "team-checkout" });
    await refresh();

    const res = await request(app).get("/teams");

    expect(res.status).toBe(200);
    expect(res.text).toContain("team-identity");
    expect(res.text).toContain("team-checkout");
    expect(res.text).toContain("2 services");
    expect(res.text).toContain("1 service<");
  });

  it("shows an empty state when there are no teams yet", async () => {
    const res = await request(app).get("/teams");
    expect(res.status).toBe(200);
    expect(res.text).toContain("No teams registered yet");
  });
});

describe("GET /teams/:owner", () => {
  it("lists every service owned by the team and aggregates open incidents", async () => {
    await writeExampleService("checkout-web", [], {
      owner: "team-checkout",
      health: { openIncidents: 2 },
    });
    await writeExampleService("legacy-cart-service", [], {
      owner: "team-checkout",
      health: { openIncidents: 1 },
    });
    await refresh();

    const res = await request(app).get("/teams/team-checkout");

    expect(res.status).toBe(200);
    expect(res.text).toContain("checkout-web");
    expect(res.text).toContain("legacy-cart-service");
    expect(res.text).toContain("3 open incidents");
  });

  it("returns 404 for a team that owns no services", async () => {
    const res = await request(app).get("/teams/team-ghost");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Team not found");
  });

  it("links on-call rotations through escalation config when configured", async () => {
    await writeExampleService("checkout-web", [], { owner: "team-checkout" });
    await refresh();

    const escalatingApp = createApp({ ...options, escalation: { pagerdutySubdomain: "acme" } });
    const res = await request(escalatingApp).get("/teams/team-checkout");

    expect(res.text).toContain("https://acme.pagerduty.com/schedules#/search?query=checkout-web-primary");
  });
});

describe("GET /graph", () => {
  it("renders an svg with a node per service", async () => {
    await writeExampleService("user-service");
    await writeExampleService("checkout-web", ["user-service"]);
    await refresh();

    const res = await request(app).get("/graph");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<svg");
    expect(res.text).toContain(">user-service<");
    expect(res.text).toContain(">checkout-web<");
  });
});

describe("POST /admin/refresh", () => {
  it("picks up filesystem changes and redirects back to the catalog", async () => {
    await writeExampleService("fresh-service");

    const res = await request(app).post("/admin/refresh");
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/");

    const after = await request(app).get("/");
    expect(after.text).toContain("fresh-service");
    expect(after.text).not.toContain("Not yet refreshed");
  });

  it("only redirects to a local path, never an external one", async () => {
    const res = await request(app)
      .post("/admin/refresh")
      .query({ redirectTo: "//evil.example.com" });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/");
  });

  it("redirects to an allowed local path when given one", async () => {
    await writeExampleService("graphed-service");
    const res = await request(app).post("/admin/refresh").query({ redirectTo: "/graph" });
    expect(res.headers.location).toBe("/graph");
  });

  it("requires the admin token when one is configured", async () => {
    const gatedApp = createApp({ ...options, adminToken: "secret" });

    const unauthorized = await request(gatedApp).post("/admin/refresh");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers["www-authenticate"]).toContain("Basic");

    const authorized = await request(gatedApp).post("/admin/refresh").auth("admin", "secret");
    expect(authorized.status).toBe(303);
  });

  it("rejects an incorrect admin token", async () => {
    const gatedApp = createApp({ ...options, adminToken: "secret" });
    const res = await request(gatedApp).post("/admin/refresh").auth("admin", "wrong");
    expect(res.status).toBe(401);
  });
});

describe("GET /create", () => {
  it("renders the create-service form", async () => {
    const res = await request(app).get("/create");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Create New Service");
    expect(res.text).toContain('name="name"');
    expect(res.text).toContain('<select name="kind">');
    expect(res.text).toContain(">Website<");
    expect(res.text).toContain(">Library<");
  });

  it("requires the admin token when one is configured", async () => {
    const gatedApp = createApp({ ...options, adminToken: "secret" });

    const unauthorized = await request(gatedApp).get("/create");
    expect(unauthorized.status).toBe(401);

    const authorized = await request(gatedApp).get("/create").auth("admin", "secret");
    expect(authorized.status).toBe(200);
  });
});

describe("POST /create", () => {
  it("scaffolds a new service and registers it in the catalog immediately", async () => {
    await writeExampleService("user-service");
    await refresh();

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

  it("requires the admin token when one is configured", async () => {
    const gatedApp = createApp({ ...options, adminToken: "secret" });
    const payload = {
      name: "gated-service",
      description: "x",
      owner: "team-example",
      lifecycle: "experimental",
    };

    const unauthorized = await request(gatedApp).post("/create").type("form").send(payload);
    expect(unauthorized.status).toBe(401);

    const authorized = await request(gatedApp).post("/create").auth("admin", "secret").type("form").send(payload);
    expect(authorized.status).toBe(200);
  });

  it("scaffolds a website from the website golden path when kind is Website", async () => {
    const res = await request(app).post("/create").type("form").send({
      name: "marketing-site",
      description: "Public marketing site.",
      owner: "team-marketing",
      kind: "Website",
      lifecycle: "experimental",
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain("marketing-site");

    const generatedFile = await fs.readFile(
      path.join(generatedDir, "marketing-site", "catalog-info.yaml"),
      "utf8",
    );
    expect(generatedFile).toContain("kind: Website");
  });

  it("scaffolds a library from the library golden path when kind is Library", async () => {
    const res = await request(app).post("/create").type("form").send({
      name: "shared-utils",
      description: "Shared utility functions.",
      owner: "team-platform",
      kind: "Library",
      lifecycle: "experimental",
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain("shared-utils");

    const generatedFile = await fs.readFile(
      path.join(generatedDir, "shared-utils", "catalog-info.yaml"),
      "utf8",
    );
    expect(generatedFile).toContain("kind: Library");
  });

  it("defaults to the service golden path when kind is omitted", async () => {
    const res = await request(app).post("/create").type("form").send({
      name: "default-kind-service",
      description: "x",
      owner: "team-example",
      lifecycle: "experimental",
    });

    expect(res.status).toBe(200);
    const generatedFile = await fs.readFile(
      path.join(generatedDir, "default-kind-service", "catalog-info.yaml"),
      "utf8",
    );
    expect(generatedFile).toContain("kind: Service");
  });

  it("rejects an invalid kind", async () => {
    const res = await request(app).post("/create").type("form").send({
      name: "bad-kind-service",
      description: "x",
      owner: "team-example",
      kind: "Database",
      lifecycle: "experimental",
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Could not create service");

    const exists = await fs
      .access(path.join(generatedDir, "bad-kind-service"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("rejects a name that collides with an existing service", async () => {
    await writeExampleService("user-service");
    await refresh();

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
