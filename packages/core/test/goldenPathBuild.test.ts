import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderTemplate } from "../src/template";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const tscBin = path.join(repoRoot, "node_modules", ".bin", "tsc");

const scaffoldDirs: string[] = [];

afterEach(async () => {
  while (scaffoldDirs.length > 0) {
    const dir = scaffoldDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

/**
 * Real scaffolds land under `generated/`, inside this monorepo. Rendering
 * into a temp dir under the repo root (instead of os.tmpdir()) reproduces
 * that: with no local tsconfig.json, `tsc` walks up and silently picks up
 * the repo root's project-reference solution file instead of erroring.
 */
async function scaffold(
  templateDirName: string,
  outputName: string,
  variables: Record<string, string>,
): Promise<string> {
  const templateDir = path.join(repoRoot, "templates", templateDirName);
  const outputDir = path.join(repoRoot, `.tmp-golden-path-build-${outputName}-${Date.now()}`);
  scaffoldDirs.push(outputDir);
  await renderTemplate(templateDir, outputDir, {
    name: variables.name,
    description: variables.description,
    owner: variables.owner,
    lifecycle: variables.lifecycle,
    dependsOnYaml: variables.dependsOnYaml,
  });
  return outputDir;
}

describe("golden-path templates produce a buildable service", () => {
  it("Service template's npm run build compiles src/index.ts into dist/index.js", async () => {
    const outputDir = await scaffold("golden-path-service", "service", {
      name: "widget-service",
      description: "A test widget service",
      owner: "team-platform",
      lifecycle: "experimental",
      dependsOnYaml: "[]",
    });

    execFileSync(tscBin, [], { cwd: outputDir });

    const built = await fs.readFile(path.join(outputDir, "dist", "index.js"), "utf8");
    expect(built).toContain("widget-service is alive");
  });

  it("Library template's npm run build compiles src/index.ts into dist/index.js and dist/index.d.ts", async () => {
    const outputDir = await scaffold("golden-path-library", "library", {
      name: "shared-utils",
      description: "A test shared library",
      owner: "team-platform",
      lifecycle: "experimental",
      dependsOnYaml: "[]",
    });

    execFileSync(tscBin, [], { cwd: outputDir });

    const built = await fs.readFile(path.join(outputDir, "dist", "index.js"), "utf8");
    expect(built).toContain("shared-utils");

    await expect(fs.access(path.join(outputDir, "dist", "index.d.ts"))).resolves.toBeUndefined();
  });
});
