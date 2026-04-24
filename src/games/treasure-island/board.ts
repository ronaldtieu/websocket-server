// Fixed 9x9 island board.
//
// The grid uses (x,y) with x = column 0..8 and y = row 0..8 (top→down).
// Cells are land or water. A handful of fence "edges" sit between adjacent
// land cells: fences block orthogonal traversal unless the hidden rule is
// discovered. Red dots are anchored at four cardinal interior positions plus
// the centre. Boxes (10) sit on land, well-spaced; one is the Treasure Chest.
//
// The layout is deliberately handcrafted so:
//   - A spiral of water hugs the outer row/column edges (frames the island)
//   - There's a horizontal fence "wall" mid-board to gate exploration
//   - Every red dot is on land
//   - Every box is on land and not on a red dot
//   - A handful of box positions sit "behind" fences, rewarding the
//     hidden-rule discovery.

import type { BoardLayout, BoxDef, CellDef, FenceDef, RedDotDef } from './types.js';
import { BOARD_SIZE } from './types.js';

// helpers ---------------------------------------------------------------

export function idx(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

export function fromIdx(i: number): { x: number; y: number } {
  return { x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) };
}

export function fenceKey(a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}-${hi}`;
}

// terrain definition ----------------------------------------------------

// 1 = land, 0 = water. Visually inspect rows top to bottom.
const TERRAIN: number[][] = [
  [0, 0, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 0, 0],
];

// Fences sit between two adjacent land cells. Listed as (x1,y1)-(x2,y2).
// Used to test the "3D" gating: a path that crosses one of these edges is
// only legal once the hidden rule is unlocked.
const FENCE_EDGES: [[number, number], [number, number]][] = [
  // central horizontal wall along y=4 / y=5
  [
    [2, 4],
    [2, 5],
  ],
  [
    [3, 4],
    [3, 5],
  ],
  [
    [4, 4],
    [4, 5],
  ],
  [
    [5, 4],
    [5, 5],
  ],
  [
    [6, 4],
    [6, 5],
  ],
  // a small vertical run on the upper-left
  [
    [3, 2],
    [4, 2],
  ],
  [
    [3, 3],
    [4, 3],
  ],
  // a small vertical run on the lower-right
  [
    [5, 6],
    [6, 6],
  ],
  [
    [5, 7],
    [6, 7],
  ],
];

// Fixed red-dot anchors. Five total — four "compass" points and centre.
// All sit on land and aren't covered by any box.
const RED_DOTS_RAW: RedDotDef[] = [
  { id: 'rd-n', x: 4, y: 1 },
  { id: 'rd-w', x: 1, y: 4 },
  { id: 'rd-c', x: 4, y: 4 },
  { id: 'rd-e', x: 7, y: 4 },
  { id: 'rd-s', x: 4, y: 7 },
];

// 10 boxes on land. Index 9 (the last entry) is the Treasure Chest. VP values
// for ordinary rewards stay small; the spec scoring buckets work even with
// a modest pool. Avoid placing on red-dot squares.
const BOXES_RAW: Omit<BoxDef, 'isTreasure' | 'vp'>[] = [
  { id: 'box-1', x: 3, y: 0 },
  { id: 'box-2', x: 6, y: 1 },
  { id: 'box-3', x: 0, y: 3 },
  { id: 'box-4', x: 8, y: 3 },
  { id: 'box-5', x: 2, y: 5 },
  { id: 'box-6', x: 6, y: 5 },
  { id: 'box-7', x: 0, y: 6 },
  { id: 'box-8', x: 8, y: 6 },
  { id: 'box-9', x: 2, y: 8 },
  // treasure chest sits "behind" the central fence wall — easier to reach
  // once the hidden 3D rule is unlocked.
  { id: 'box-treasure', x: 5, y: 8 },
];

const ORDINARY_VPS = [12, 8, 14, 10, 6, 16, 9, 11, 7];

export function buildBoard(): BoardLayout {
  const cells: CellDef[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      cells.push({ x, y, terrain: TERRAIN[y][x] === 1 ? 'land' : 'water' });
    }
  }

  const fences: FenceDef[] = FENCE_EDGES.map(([[x1, y1], [x2, y2]]) => {
    const a = idx(x1, y1);
    const b = idx(x2, y2);
    return a < b ? { a, b } : { a: b, b: a };
  });

  const redDots = RED_DOTS_RAW.map((d) => ({ ...d }));

  const boxes: BoxDef[] = BOXES_RAW.map((b, i) => {
    const isTreasure = b.id === 'box-treasure';
    return {
      ...b,
      isTreasure,
      vp: isTreasure ? 20 : ORDINARY_VPS[i],
    };
  });

  return { size: BOARD_SIZE, cells, fences, redDots, boxes };
}

// Quick lookup helpers for path/box validation.
export function buildFenceSet(layout: BoardLayout): Set<string> {
  const s = new Set<string>();
  for (const f of layout.fences) s.add(fenceKey(f.a, f.b));
  return s;
}

export function buildRedDotSet(layout: BoardLayout): Set<number> {
  const s = new Set<number>();
  for (const d of layout.redDots) s.add(idx(d.x, d.y));
  return s;
}

export function buildBoxByCell(layout: BoardLayout): Map<number, BoxDef> {
  const m = new Map<number, BoxDef>();
  for (const b of layout.boxes) m.set(idx(b.x, b.y), b);
  return m;
}

export function isLand(layout: BoardLayout, i: number): boolean {
  const c = layout.cells[i];
  return c?.terrain === 'land';
}
