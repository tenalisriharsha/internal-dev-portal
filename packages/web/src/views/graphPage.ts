import type { DependencyGraph } from "@idp/core";
import { escapeHtml } from "./escape";
import { layout } from "./layout";

interface Point {
  x: number;
  y: number;
}

const WIDTH = 760;
const HEIGHT = 560;
const NODE_RADIUS = 26;

const STATUS_BY_LIFECYCLE: Record<string, "good" | "warning" | "serious" | "critical"> = {
  production: "good",
  staging: "warning",
  experimental: "serious",
  deprecated: "critical",
};

function layoutNodes(ids: string[]): Map<string, Point> {
  const positions = new Map<string, Point>();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const radius = Math.min(WIDTH, HEIGHT) / 2 - 90;

  if (ids.length === 1) {
    positions.set(ids[0], { x: cx, y: cy });
    return positions;
  }

  ids.forEach((id, index) => {
    const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
    positions.set(id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });
  return positions;
}

/** Pulls the line endpoint back along its direction so the arrowhead lands outside the node circle. */
function pullBack(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: to.x - (dx / length) * distance, y: to.y - (dy / length) * distance };
}

export function renderGraphPage(graph: DependencyGraph): string {
  const positions = layoutNodes(graph.nodes.map((n) => n.id));

  const edgesSvg = graph.edges
    .map((edge) => {
      const from = positions.get(edge.source);
      const to = positions.get(edge.target);
      if (!from || !to) return "";
      const adjustedTo = pullBack(from, to, NODE_RADIUS + 10);
      return `<line class="graph-edge" x1="${from.x}" y1="${from.y}" x2="${adjustedTo.x}" y2="${adjustedTo.y}" marker-end="url(#arrow)" />`;
    })
    .join("");

  const nodesSvg = graph.nodes
    .map((node) => {
      const point = positions.get(node.id);
      if (!point) return "";
      const status = STATUS_BY_LIFECYCLE[node.lifecycle] ?? "serious";
      return `
        <g class="graph-node">
          <circle class="graph-node__circle graph-node__circle--${status}" cx="${point.x}" cy="${point.y}" r="${NODE_RADIUS}" />
          <text class="graph-node__label" x="${point.x}" y="${point.y + NODE_RADIUS + 18}" text-anchor="middle">${escapeHtml(node.id)}</text>
        </g>`;
    })
    .join("");

  const legend = (
    [
      ["good", "production"],
      ["warning", "staging"],
      ["serious", "experimental"],
      ["critical", "deprecated"],
    ] as const
  )
    .map(
      ([status, label]) =>
        `<span class="graph-legend__item"><span class="graph-legend__swatch graph-legend__swatch--${status}"></span>${label}</span>`,
    )
    .join("");

  const body = `
    <div class="page-header">
      <h1>Dependency Graph</h1>
      <p class="page-subtitle">Arrows point from a service to the services it depends on. ${graph.nodes.length} services, ${graph.edges.length} dependency edges.</p>
    </div>
    <div class="graph-legend">${legend}</div>
    <div class="panel graph-panel">
      ${
        graph.nodes.length > 0
          ? `<svg class="graph-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Service dependency graph">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" class="graph-arrowhead" />
                </marker>
              </defs>
              ${edgesSvg}
              ${nodesSvg}
            </svg>`
          : '<p class="empty-state">No services registered yet, so there is nothing to graph.</p>'
      }
    </div>`;

  return layout("Dependency Graph", body, "/graph");
}
