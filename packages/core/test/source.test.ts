import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRepoSource, LocalDirectorySource } from "../src/source";

describe("LocalDirectorySource", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "idp-source-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reads catalog-info.yaml from each immediate subdirectory", async () => {
    await fs.mkdir(path.join(tmpDir, "svc-a"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "svc-a", "catalog-info.yaml"), "a: 1", "utf8");

    const source = new LocalDirectorySource(tmpDir);
    const result = await source.load();

    expect(result.errors).toEqual([]);
    expect(result.files).toEqual([
      { id: path.join(tmpDir, "svc-a", "catalog-info.yaml"), contents: "a: 1" },
    ]);
  });

  it("returns no files and no errors for a root that does not exist", async () => {
    const source = new LocalDirectorySource(path.join(tmpDir, "missing"));
    const result = await source.load();
    expect(result.files).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe("GitHubRepoSource", () => {
  it("fetches raw catalog-info.yaml content from each configured repo", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(
        "https://api.github.com/repos/acme/widgets/contents/catalog-info.yaml?ref=main",
      );
      return new Response("apiVersion: idp.dev/v1", { status: 200 });
    });

    const source = new GitHubRepoSource({
      repos: [{ owner: "acme", repo: "widgets", ref: "main" }],
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await source.load();

    expect(result.errors).toEqual([]);
    expect(result.files).toEqual([
      { id: "github:acme/widgets", contents: "apiVersion: idp.dev/v1" },
    ]);
  });

  it("sends an Authorization header when a token is configured", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
      return new Response("ok", { status: 200 });
    });

    const source = new GitHubRepoSource({
      repos: [{ owner: "acme", repo: "widgets" }],
      token: "secret-token",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await source.load();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("skips a repo with no catalog-info.yaml (404) without recording an error", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 404 }));
    const source = new GitHubRepoSource({
      repos: [{ owner: "acme", repo: "no-catalog" }],
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await source.load();
    expect(result.files).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("records a validation issue for a non-404 error response", async () => {
    const fetchFn = vi.fn(
      async () => new Response("nope", { status: 500, statusText: "Internal Server Error" }),
    );
    const source = new GitHubRepoSource({
      repos: [{ owner: "acme", repo: "broken" }],
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await source.load();
    expect(result.files).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe("github:acme/broken");
    expect(result.errors[0].message).toMatch(/GitHub API error 500/);
  });

  it("records a validation issue when the fetch itself throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const source = new GitHubRepoSource({
      repos: [{ owner: "acme", repo: "unreachable" }],
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await source.load();
    expect(result.files).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/failed to fetch from GitHub/);
  });

  it("queries multiple repos independently and merges their results", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("widgets")) return new Response("widgets-yaml", { status: 200 });
      return new Response(null, { status: 404 });
    });

    const source = new GitHubRepoSource({
      repos: [
        { owner: "acme", repo: "widgets" },
        { owner: "acme", repo: "empty" },
      ],
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await source.load();
    expect(result.files).toEqual([{ id: "github:acme/widgets", contents: "widgets-yaml" }]);
    expect(result.errors).toEqual([]);
  });
});
