import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CatalogStore } from "../src/store";
import { LocalDirectorySource } from "../src/source";
import type { CatalogSource, SourceLoadResult } from "../src/source";

class StubSource implements CatalogSource {
  constructor(private readonly result: SourceLoadResult) {}
  async load(): Promise<SourceLoadResult> {
    return this.result;
  }
}

const goodYaml = (name: string) => `
apiVersion: idp.dev/v1
kind: Service
metadata:
  name: ${name}
  description: Example service ${name}.
spec:
  lifecycle: production
  owner: team-example
  dependsOn: []
`;

let tmpDir: string;
let store: CatalogStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-store-"));
  store = new CatalogStore(":memory:");
});

afterEach(async () => {
  store.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("CatalogStore", () => {
  it("starts with an empty snapshot and no refresh timestamp", () => {
    const snapshot = store.snapshot();
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.errors).toEqual([]);
    expect(store.refreshedAt()).toBeNull();
  });

  it("persists entries from a refresh so a later snapshot reflects them", async () => {
    await fs.mkdir(path.join(tmpDir, "svc-a"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "svc-a", "catalog-info.yaml"), goodYaml("svc-a"), "utf8");

    await store.refresh([new LocalDirectorySource(tmpDir)]);
    const snapshot = store.snapshot();

    expect(snapshot.entries.map((e) => e.metadata.name)).toEqual(["svc-a"]);
    expect(snapshot.sourceFiles["svc-a"]).toContain("svc-a");
    expect(store.refreshedAt()).not.toBeNull();
  });

  it("replaces the previous snapshot entirely on the next refresh", async () => {
    await store.refresh([
      new StubSource({ files: [{ id: "f1", contents: goodYaml("first") }], errors: [] }),
    ]);
    expect(store.snapshot().entries.map((e) => e.metadata.name)).toEqual(["first"]);

    await store.refresh([
      new StubSource({ files: [{ id: "f2", contents: goodYaml("second") }], errors: [] }),
    ]);
    expect(store.snapshot().entries.map((e) => e.metadata.name)).toEqual(["second"]);
  });

  it("persists validation errors reported by a source", async () => {
    await store.refresh([
      new StubSource({ files: [], errors: [{ file: "bad", message: "boom" }] }),
    ]);

    const snapshot = store.snapshot();
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.errors).toEqual([{ file: "bad", message: "boom" }]);
  });

  it("never reloads from sources when only snapshot() is called", async () => {
    let loadCount = 0;
    const countingSource: CatalogSource = {
      async load() {
        loadCount += 1;
        return { files: [], errors: [] };
      },
    };

    await store.refresh([countingSource]);
    store.snapshot();
    store.snapshot();
    store.snapshot();

    expect(loadCount).toBe(1);
  });
});
