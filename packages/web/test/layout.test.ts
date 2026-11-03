import type { CatalogEntry } from "@idp/core";
import { describe, expect, it } from "vitest";
import { layout } from "../src/views/layout";
import { renderTeamDetail } from "../src/views/teamDetail";

describe("layout", () => {
  it("escapes special characters in the title", () => {
    const html = layout("</title><script>alert(1)</script>", "<p>body</p>");

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("renderTeamDetail", () => {
  it("escapes an owner containing markup so no script tag reaches <head>", () => {
    const owner = "</title><script>alert(1)</script>";
    const entry: CatalogEntry = {
      apiVersion: "idp.dev/v1",
      kind: "Service",
      metadata: { name: "svc-a", description: "d", tags: [] },
      spec: { lifecycle: "production", owner, dependsOn: [] },
    };

    const html = renderTeamDetail(owner, [entry], {});
    const head = html.slice(0, html.indexOf("</head>"));

    expect(head).not.toContain("<script>alert(1)</script>");
    expect(head).toContain("&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
