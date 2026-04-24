// Grid layout for the Unknown / cube-board game.
//
// Layout: a 7x7 board.
//   - the four corners + 4 edge-center squares are "gray" starting squares
//   - the dead-center square (3,3) is the black goal
//   - everything else is a colored square; colors are assigned so that all
//     six colors appear in roughly even frequency and so that adjacency is
//     varied enough for the hidden rules to have something to chew on.
//
// Squares are numbered 1..N row-major (0,0) bottom-left -> (W-1,H-1) top-right.
// The "printed number" is what's used to rank players who haven't reached the
// goal at game-end (higher = better).

import type { BoardDef, CubeColor, Direction, SquareDef } from './types.js';

const WIDTH = 7;
const HEIGHT = 7;

// fixed pattern so the board is consistent across games. crafted by hand to
// avoid huge same-color blobs (which would let bonus-turn fire trivially).
// '.' marks squares that will be overwritten by gray/goal; we write a color
// here for each cell, then mask off the gray + goal slots afterwards.
const COLOR_TEMPLATE: CubeColor[][] = [
  // y=0 (bottom)
  ['red', 'yellow', 'blue', 'green', 'red', 'purple', 'yellow'],
  ['purple', 'green', 'white', 'red', 'yellow', 'blue', 'green'],
  ['blue', 'red', 'yellow', 'purple', 'white', 'green', 'red'],
  ['green', 'white', 'purple', 'blue', 'red', 'yellow', 'white'],
  ['yellow', 'blue', 'red', 'white', 'green', 'purple', 'blue'],
  ['white', 'purple', 'green', 'yellow', 'blue', 'red', 'green'],
  ['red', 'green', 'blue', 'white', 'yellow', 'green', 'purple'],
  // y=6 (top)
];

// Gray starting squares: 4 corners + 4 edge midpoints.
const GRAY_COORDS: [number, number][] = [
  [0, 0],
  [WIDTH - 1, 0],
  [0, HEIGHT - 1],
  [WIDTH - 1, HEIGHT - 1],
  [Math.floor(WIDTH / 2), 0],
  [Math.floor(WIDTH / 2), HEIGHT - 1],
  [0, Math.floor(HEIGHT / 2)],
  [WIDTH - 1, Math.floor(HEIGHT / 2)],
];

const GOAL_COORD: [number, number] = [Math.floor(WIDTH / 2), Math.floor(HEIGHT / 2)];

export function buildBoard(): BoardDef {
  const squares: SquareDef[] = [];
  let index = 1;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const isGoal = x === GOAL_COORD[0] && y === GOAL_COORD[1];
      const isGray = GRAY_COORDS.some((g) => g[0] === x && g[1] === y);
      let kind: SquareDef['kind'] = 'color';
      let color: CubeColor | null = COLOR_TEMPLATE[y][x];
      if (isGoal) {
        kind = 'goal';
        color = null;
      } else if (isGray) {
        kind = 'gray';
        color = null;
      }
      squares.push({ index: index++, x, y, kind, color });
    }
  }
  const goalIndex = squares.findIndex((s) => s.kind === 'goal');
  const grayStartIndices = squares
    .filter((s) => s.kind === 'gray')
    .map((s) => squares.indexOf(s));
  return {
    width: WIDTH,
    height: HEIGHT,
    squares,
    goalIndex,
    grayStartIndices,
  };
}

export function squareAt(board: BoardDef, x: number, y: number): SquareDef | null {
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) return null;
  return board.squares[y * board.width + x];
}

export function neighbor(board: BoardDef, idx: number, dir: Direction): SquareDef | null {
  const s = board.squares[idx];
  if (!s) return null;
  const [dx, dy] = DIR_DELTAS[dir];
  return squareAt(board, s.x + dx, s.y + dy);
}

export const DIR_DELTAS: Record<Direction, [number, number]> = {
  N: [0, 1],
  S: [0, -1],
  E: [1, 0],
  W: [-1, 0],
};

// Eight-direction adjacency (used by Bonus Turn rule which counts diagonals).
export function adjacentSquares(board: BoardDef, idx: number, includeDiagonals = false): SquareDef[] {
  const s = board.squares[idx];
  if (!s) return [];
  const offsets: [number, number][] = includeDiagonals
    ? [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ];
  const out: SquareDef[] = [];
  for (const [dx, dy] of offsets) {
    const sq = squareAt(board, s.x + dx, s.y + dy);
    if (sq) out.push(sq);
  }
  return out;
}

export function isGray(board: BoardDef, idx: number): boolean {
  return board.squares[idx]?.kind === 'gray';
}

export function isGoal(board: BoardDef, idx: number): boolean {
  return board.squares[idx]?.kind === 'goal';
}

// Pick an empty gray start for a banished cube. `occupied` is the set of
// square indices that already host a cube. If every gray square is taken
// we fall back to the first gray square (rare with realistic player counts).
export function pickEmptyGrayStart(
  board: BoardDef,
  occupied: ReadonlySet<number>,
  rng: () => number = Math.random,
): number {
  const free = board.grayStartIndices.filter((i) => !occupied.has(i));
  const pool = free.length > 0 ? free : board.grayStartIndices;
  return pool[Math.floor(rng() * pool.length)];
}
