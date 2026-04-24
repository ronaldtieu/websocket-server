// Hardcoded subway graph for Crooked Cops. 40 nodes, 3 colored "lines" that
// cross at a few interchange stations. Node ids encode line+number for
// readability in payloads (e.g. "R3" = Red line, station 3).
//
// Layout is a hand-tuned 0..1 unit square that the main screen scales to
// the viewport — fine for a phone-friendly display.

import type { NodeId, SubwayGraph } from './types.js';

interface RawNode {
  id: NodeId;
  x: number;
  y: number;
  // Connections to other nodes (only listed once — the builder mirrors them).
  links: NodeId[];
}

// Three lines (Red 1-12, Blue 1-14, Green 1-14), with R7=B5 and B11=G6 as
// interchanges modeled by extra edges. Total 40 unique nodes.
const RAW: RawNode[] = [
  // Red line — runs roughly diagonally NW -> SE
  { id: 'R1', x: 0.05, y: 0.1, links: ['R2'] },
  { id: 'R2', x: 0.12, y: 0.18, links: ['R3'] },
  { id: 'R3', x: 0.2, y: 0.25, links: ['R4', 'B2'] },
  { id: 'R4', x: 0.27, y: 0.32, links: ['R5'] },
  { id: 'R5', x: 0.34, y: 0.4, links: ['R6'] },
  { id: 'R6', x: 0.42, y: 0.47, links: ['R7'] },
  { id: 'R7', x: 0.5, y: 0.52, links: ['R8', 'B5', 'G3'] },
  { id: 'R8', x: 0.58, y: 0.58, links: ['R9'] },
  { id: 'R9', x: 0.66, y: 0.65, links: ['R10'] },
  { id: 'R10', x: 0.74, y: 0.72, links: ['R11', 'G8'] },
  { id: 'R11', x: 0.82, y: 0.8, links: ['R12'] },
  { id: 'R12', x: 0.9, y: 0.88, links: [] },

  // Blue line — runs roughly horizontal across the upper third
  { id: 'B1', x: 0.07, y: 0.4, links: ['B2'] },
  { id: 'B2', x: 0.18, y: 0.38, links: ['B3'] },
  { id: 'B3', x: 0.28, y: 0.36, links: ['B4'] },
  { id: 'B4', x: 0.38, y: 0.45, links: ['B5'] },
  { id: 'B5', x: 0.5, y: 0.52, links: ['B6'] }, // shared with R7 conceptually; modeled as separate node + edge
  { id: 'B6', x: 0.6, y: 0.45, links: ['B7'] },
  { id: 'B7', x: 0.7, y: 0.38, links: ['B8'] },
  { id: 'B8', x: 0.78, y: 0.32, links: ['B9'] },
  { id: 'B9', x: 0.85, y: 0.27, links: ['B10'] },
  { id: 'B10', x: 0.92, y: 0.22, links: ['B11'] },
  { id: 'B11', x: 0.92, y: 0.5, links: ['B12', 'G6'] },
  { id: 'B12', x: 0.85, y: 0.6, links: ['B13'] },
  { id: 'B13', x: 0.78, y: 0.68, links: ['B14'] },
  { id: 'B14', x: 0.7, y: 0.78, links: [] },

  // Green line — runs roughly vertical / south spine
  { id: 'G1', x: 0.32, y: 0.62, links: ['G2'] },
  { id: 'G2', x: 0.42, y: 0.6, links: ['G3'] },
  { id: 'G3', x: 0.5, y: 0.58, links: ['G4'] },
  { id: 'G4', x: 0.58, y: 0.66, links: ['G5'] },
  { id: 'G5', x: 0.66, y: 0.72, links: ['G6'] },
  { id: 'G6', x: 0.74, y: 0.55, links: ['G7'] },
  { id: 'G7', x: 0.65, y: 0.5, links: ['G8'] },
  { id: 'G8', x: 0.55, y: 0.78, links: ['G9'] },
  { id: 'G9', x: 0.45, y: 0.85, links: ['G10'] },
  { id: 'G10', x: 0.32, y: 0.88, links: ['G11'] },
  { id: 'G11', x: 0.22, y: 0.78, links: ['G12'] },
  { id: 'G12', x: 0.15, y: 0.7, links: ['G13'] },
  { id: 'G13', x: 0.1, y: 0.62, links: ['G14'] },
  { id: 'G14', x: 0.06, y: 0.55, links: ['B1'] },
];

// 20 piece-bearing nodes. Spread roughly evenly across the three lines and
// the interior so thieves can't camp one corner. Picked manually so the
// layout doesn't change run-to-run (deterministic for tests/replays).
const PIECE_NODE_IDS: NodeId[] = [
  'R1',
  'R3',
  'R5',
  'R8',
  'R10',
  'R12',
  'B1',
  'B3',
  'B6',
  'B9',
  'B12',
  'B14',
  'G1',
  'G2',
  'G5',
  'G7',
  'G9',
  'G11',
  'G13',
  'B11',
];

let cached: SubwayGraph | null = null;

export function getSubwayGraph(): SubwayGraph {
  if (cached) return cached;

  const nodes: NodeId[] = RAW.map((r) => r.id);
  const layout: Record<NodeId, { x: number; y: number }> = {};
  for (const r of RAW) layout[r.id] = { x: r.x, y: r.y };

  // Build adjacency from the (one-way) link declarations, then mirror.
  const adjacency: Record<NodeId, Set<NodeId>> = {};
  for (const id of nodes) adjacency[id] = new Set();
  for (const r of RAW) {
    for (const other of r.links) {
      if (!adjacency[other]) {
        throw new Error(`graph references unknown node ${other}`);
      }
      adjacency[r.id].add(other);
      adjacency[other].add(r.id);
    }
  }

  const edges: Array<[NodeId, NodeId]> = [];
  const seen = new Set<string>();
  for (const a of nodes) {
    for (const b of adjacency[a]) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }

  const adjacencyArr: Record<NodeId, NodeId[]> = {};
  for (const id of nodes) adjacencyArr[id] = Array.from(adjacency[id]).sort();

  cached = {
    nodes,
    edges,
    adjacency: adjacencyArr,
    pieceNodes: [...PIECE_NODE_IDS],
    layout,
  };
  return cached;
}

// Shortest-path distance via BFS. Used by CPU heuristics. Returns Infinity
// for disconnected nodes (shouldn't happen on this graph).
export function bfsDistance(graph: SubwayGraph, from: NodeId, to: NodeId): number {
  if (from === to) return 0;
  const visited = new Set<NodeId>([from]);
  let frontier: NodeId[] = [from];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: NodeId[] = [];
    for (const cur of frontier) {
      for (const n of graph.adjacency[cur] ?? []) {
        if (visited.has(n)) continue;
        if (n === to) return depth;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

// All nodes reachable in `maxSteps` BFS layers, including the start.
export function nodesWithin(graph: SubwayGraph, from: NodeId, maxSteps: number): NodeId[] {
  const visited = new Set<NodeId>([from]);
  let frontier: NodeId[] = [from];
  for (let i = 0; i < maxSteps; i += 1) {
    const next: NodeId[] = [];
    for (const cur of frontier) {
      for (const n of graph.adjacency[cur] ?? []) {
        if (visited.has(n)) continue;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return Array.from(visited);
}
