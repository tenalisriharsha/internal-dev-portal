import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Catalog } from "../src/catalog";
import { buildDependencyGraph, detectCycles, topologicalSort } from "../src/graph";

let tmpDir: string;

async function writeService(
  root: string,
  name: string,
  dependsOn: string[] = [],
): Promise<void> {
  const dir = path.join(root, name);
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
`,
    "utf8",
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-graph-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("buildDependencyGraph", () => {
  it("builds nodes and edges from catalog entries", async () => {
    await writeService(tmpDir, "user-service");
    await writeService(tmpDir, "checkout-web", ["user-service"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    const graph = buildDependencyGraph(catalog);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([{ source: "checkout-web", target: "user-service" }]);
  });

  it("drops edges that point at a service missing from the catalog", async () => {
    await writeService(tmpDir, "checkout-web", ["ghost-service"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    const graph = buildDependencyGraph(catalog);

    expect(graph.edges).toEqual([]);
  });
});

describe("detectCycles", () => {
  it("returns no cycles for a DAG", async () => {
    await writeService(tmpDir, "user-service");
    await writeService(tmpDir, "checkout-web", ["user-service"]);
    await writeService(tmpDir, "storefront", ["checkout-web", "user-service"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    expect(detectCycles(catalog)).toEqual([]);
  });

  it("detects a direct cycle between two services", async () => {
    await writeService(tmpDir, "service-a", ["service-b"]);
    await writeService(tmpDir, "service-b", ["service-a"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    const cycles = detectCycles(catalog);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(expect.arrayContaining(["service-a", "service-b"]));
  });

  it("detects an indirect cycle across three services", async () => {
    await writeService(tmpDir, "service-a", ["service-b"]);
    await writeService(tmpDir, "service-b", ["service-c"]);
    await writeService(tmpDir, "service-c", ["service-a"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    expect(detectCycles(catalog)).toHaveLength(1);
  });
});

describe("topologicalSort", () => {
  it("orders dependencies before dependents", async () => {
    await writeService(tmpDir, "user-service");
    await writeService(tmpDir, "checkout-web", ["user-service"]);
    await writeService(tmpDir, "storefront", ["checkout-web"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    const order = topologicalSort(catalog);

    expect(order.indexOf("user-service")).toBeLessThan(order.indexOf("checkout-web"));
    expect(order.indexOf("checkout-web")).toBeLessThan(order.indexOf("storefront"));
  });

  it("throws a descriptive error when a cycle is present", async () => {
    await writeService(tmpDir, "service-a", ["service-b"]);
    await writeService(tmpDir, "service-b", ["service-a"]);

    const catalog = await Catalog.loadFromDirectories([tmpDir]);
    expect(() => topologicalSort(catalog)).toThrow(/cycle detected/);
  });
});
