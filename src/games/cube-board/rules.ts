// Hidden-rule handlers. Each rule is a discrete function that takes the
// game's mutable state slice + the action being processed, and either
// fires (returning a RuleId so the engine can mark it revealed) or
// returns null. The engine calls these in a defined order and aggregates
// any reveals.
//
// Rules implemented:
//   1. Banishment 1: white top OR white destination -> +1 marker, returned
//      to a gray start.
//   2. Banishment 2: first two players to hit 3 markers each lose 3 Pieces.
//   3. Push-out: pushed cubes don't chain effects (Color Match / Move-Another /
//      Bonus Turn) but DO take banishment if their landing satisfies it.
//   4. Color Match: must re-orient first if no adjacent square matches the
//      cube's top color.
//   5. Move-Another: 2+ adjacent matches -> may move another player's cube
//      of that color (yellow = wild).
//   6. Bonus Turn: 3 adjacent (including diagonals) of top color -> extra turn.

import { adjacentSquares, isGray, pickEmptyGrayStart } from './board.js';
import type {
  BoardDef,
  CubeColor,
  CubeFace,
  PlayerPublic,
  RuleId,
  SquareDef,
} from './types.js';

export interface BanishmentResult {
  banished: boolean;
  newSquareIndex: number;
  reason: 'top-white' | 'destination-white' | null;
}

// Apply Banishment 1 to a single cube landing on `landedIdx` with `topColor`.
// Returns a result describing whether the cube got banished and its updated
// square index.
export function applyBanishment1(
  board: BoardDef,
  landedIdx: number,
  topColor: CubeFace,
  occupied: ReadonlySet<number>,
  rng: () => number = Math.random,
): BanishmentResult {
  const sq = board.squares[landedIdx];
  const destWhite = sq.kind === 'color' && sq.color === 'white';
  const topWhite = topColor === 'white';
  if (!destWhite && !topWhite) {
    return { banished: false, newSquareIndex: landedIdx, reason: null };
  }
  // Pick a random empty gray start. Exclude the player's own current square
  // from the "occupied" set so the math is correct.
  const occWithoutSelf = new Set(occupied);
  occWithoutSelf.delete(landedIdx);
  const newIdx = pickEmptyGrayStart(board, occWithoutSelf, rng);
  return {
    banished: true,
    newSquareIndex: newIdx,
    reason: topWhite ? 'top-white' : 'destination-white',
  };
}

export interface Banishment2Result {
  triggered: boolean;
  losers: string[]; // playerIds losing 3 pieces (size 0..2)
}

// Banishment 2 — fires the moment the first two players reach 3 markers each.
// `previousLosers` is the list of players already penalized so we don't
// double-charge them.
export function applyBanishment2(
  players: PlayerPublic[],
  previousLosers: ReadonlySet<string>,
): Banishment2Result {
  const candidates = players
    .filter((p) => p.banishments >= 3 && !previousLosers.has(p.id))
    .map((p) => p.id);
  // Spec: first TWO players to reach 3 markers each lose 3 Pieces. The
  // engine calls us as soon as a player crosses the threshold; we limit
  // total losers (including history) to 2.
  const remainingSlots = Math.max(0, 2 - previousLosers.size);
  const losers = candidates.slice(0, remainingSlots);
  return { triggered: losers.length > 0, losers };
}

// Color Match — does the cube's current top color appear on any orthogonally
// adjacent square? Returns the list of matching directions; empty means the
// player must re-orient first.
export function adjacentColorMatches(
  board: BoardDef,
  squareIdx: number,
  topColor: CubeFace,
): SquareDef[] {
  if (topColor === 'face') return adjacentSquares(board, squareIdx); // wild — anything goes
  const adj = adjacentSquares(board, squareIdx);
  return adj.filter((s) => s.kind === 'color' && s.color === topColor);
}

// Move-Another — if 2+ adjacent squares match top color (yellow = wild),
// returns true. Yellow lets the player move ANY other cube; otherwise the
// movable targets are cubes of that specific color.
export function moveAnotherEligible(
  board: BoardDef,
  squareIdx: number,
  topColor: CubeFace,
): { eligible: boolean; wild: boolean } {
  if (topColor === 'face') return { eligible: false, wild: false };
  const matches = adjacentColorMatches(board, squareIdx, topColor);
  if (matches.length < 2) return { eligible: false, wild: false };
  return { eligible: true, wild: topColor === 'yellow' };
}

// Bonus Turn — three adjacent (including diagonals) squares share top color.
export function bonusTurnEligible(
  board: BoardDef,
  squareIdx: number,
  topColor: CubeFace,
): boolean {
  if (topColor === 'face') return false;
  const adj = adjacentSquares(board, squareIdx, true);
  const same = adj.filter((s) => s.kind === 'color' && s.color === topColor);
  return same.length >= 3;
}

// Helper for the engine: full set of triggers for a primary mover after they
// land on a square (does not include banishment which is tracked separately).
export interface PostMoveTriggers {
  bonus: boolean;
  moveAnotherEligible: boolean;
  moveAnotherWild: boolean;
}

export function evaluatePostMove(
  board: BoardDef,
  squareIdx: number,
  topColor: CubeFace,
): PostMoveTriggers {
  const ma = moveAnotherEligible(board, squareIdx, topColor);
  return {
    bonus: bonusTurnEligible(board, squareIdx, topColor),
    moveAnotherEligible: ma.eligible,
    moveAnotherWild: ma.wild,
  };
}

// Helper: which other players are at adjacent squares matching `color`?
// Used to enumerate Move-Another targets. `wild=true` means any adjacent
// player cube is a target regardless of its top color.
export function findMoveAnotherTargets(
  board: BoardDef,
  fromIdx: number,
  color: CubeColor,
  wild: boolean,
  others: { playerId: string; squareIdx: number; topColor: CubeFace }[],
): string[] {
  const adj = adjacentSquares(board, fromIdx);
  const adjIdx = new Set(adj.map((s) => board.squares.indexOf(s)));
  return others
    .filter((o) => adjIdx.has(o.squareIdx))
    .filter((o) => wild || o.topColor === color)
    .map((o) => o.playerId);
}

// Convenience for the rule-reveal log: the rule fires as a side effect of
// some action; we return the RuleId once any rule first triggers.
export function ruleIdsForReveal(opts: {
  banishment1: boolean;
  banishment2: boolean;
  pushOutPrevented: boolean;
  forcedReorient: boolean;
  moveAnother: boolean;
  bonusTurn: boolean;
}): RuleId[] {
  const out: RuleId[] = [];
  if (opts.banishment1) out.push('banishment-1');
  if (opts.banishment2) out.push('banishment-2');
  if (opts.pushOutPrevented) out.push('push-out');
  if (opts.forcedReorient) out.push('color-match');
  if (opts.moveAnother) out.push('move-another');
  if (opts.bonusTurn) out.push('bonus-turn');
  return out;
}

// Re-export a tiny helper that the engine uses when banishing.
export { isGray };
