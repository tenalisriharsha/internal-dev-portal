import { Catalog } from "./catalog";

export interface GraphNode {
  id: string;
  kind: string;
  lifecycle: string;
  owner: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Builds a nodes/edges graph from the catalog, ready to serialize for a renderer. */
export function buildDependencyGraph(catalog: Catalog): DependencyGraph {
  const entries = catalog.list();
  const names = new Set(entries.map((entry) => entry.metadata.name));

  const nodes: GraphNode[] = entries.map((entry) => ({
    id: entry.metadata.name,
    kind: entry.kind,
    lifecycle: entry.spec.lifecycle,
    owner: entry.spec.owner,
  }));

  const edges: GraphEdge[] = [];
  for (const entry of entries) {
    for (const dependency of entry.spec.dependsOn) {
      if (names.has(dependency)) {
        edges.push({ source: entry.metadata.name, target: dependency });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Detects dependency cycles using DFS. Returns each distinct cycle as an
 * ordered list of service names, e.g. ["a", "b", "c"] meaning a -> b -> c -> a.
 */
export function detectCycles(catalog: Catalog): string[][] {
  const graph = buildDependencyGraph(catalog);
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function visit(node: string): void {
    visited.add(node);
    stack.push(node);
    onStack.add(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        visit(neighbor);
      } else if (onStack.has(neighbor)) {
        const cycleStart = stack.indexOf(neighbor);
        cycles.push(stack.slice(cycleStart));
      }
    }

    stack.pop();
    onStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) visit(node);
  }

  return cycles;
}

/** Topologically sorts services so dependencies come before dependents. Throws if a cycle exists. */
export function topologicalSort(catalog: Catalog): string[] {
  const cycles = detectCycles(catalog);
  if (cycles.length > 0) {
    throw new Error(
      `cannot topologically sort: cycle detected (${cycles[0].join(" -> ")} -> ${cycles[0][0]})`,
    );
  }

  const graph = buildDependencyGraph(catalog);
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    // edge.source depends on edge.target, so target must come before source
    adjacency.get(edge.target)?.push(edge.source);
    inDegree.set(edge.source, (inDegree.get(edge.source) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([name]) => name)
    .sort();
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const degree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  return order;
}
