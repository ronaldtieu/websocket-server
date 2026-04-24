// Pure helpers for Balance Mancala rules: legal-move enumeration,
// stone sowing, scoring (including Angel/Devil routing), end-condition
// detection, and the lightweight cloneable engine state used by the
// CPU minimax search.

import {
  DISH_LAYOUT,
  RING_SIZE,
  SCORE_END_THRESHOLD,
  type ColorTotals,
  type Dish,
  type DishColor,
  type Stone,
} from './types.js';

// minimal mutable state for sowing/scoring. mirrors the live game state
// but without socket/phase concerns so it can be cloned cheaply for
// CPU lookahead.
export interface EngineState {
  dishes: Dish[];
  totals: Map<string, ColorTotals>;
}

export function freshDishes(): Dish[] {
  return DISH_LAYOUT.map((color, index) => ({ index, color, stones: [] }));
}

export function freshTotals(): ColorTotals {
  return { R: 0, B: 0, G: 0 };
}

// deep-clone state so minimax can mutate without affecting the caller.
export function cloneEngineState(state: EngineState): EngineState {
  return {
    dishes: state.dishes.map((d) => ({
      index: d.index,
      color: d.color,
      stones: d.stones.map((s) => ({ ownerId: s.ownerId })),
    })),
    totals: new Map(
      Array.from(state.totals.entries()).map(([id, t]) => [id, { ...t }]),
    ),
  };
}

// legal moves in the playing phase: any dish that contains at least one
// stone owned by the player.
export function legalPickMoves(state: EngineState, playerId: string): number[] {
  const moves: number[] = [];
  for (const dish of state.dishes) {
    if (dish.stones.some((s) => s.ownerId === playerId)) moves.push(dish.index);
  }
  return moves;
}

// legal moves in the placement phase: every dish (you can stack on any).
export function legalPlacementMoves(): number[] {
  return Array.from({ length: RING_SIZE }, (_, i) => i);
}

export function placeStone(state: EngineState, dishIndex: number, ownerId: string): void {
  state.dishes[dishIndex].stones.push({ ownerId });
}

// pick up all stones in `dishIndex` and sow one-per-dish clockwise.
// returns the index where the last stone lands and any score update.
export interface SowResult {
  landedAt: number;
  scored: { color: DishColor; amount: number; ownerId: string } | null;
}

export function sowAndScore(state: EngineState, dishIndex: number): SowResult {
  const source = state.dishes[dishIndex];
  const picked: Stone[] = source.stones;
  source.stones = [];

  if (picked.length === 0) {
    // engine guard — handleAction should reject this earlier. fall back to a
    // no-op so the search can't crash on a bad branch.
    return { landedAt: dishIndex, scored: null };
  }

  let cursor = dishIndex;
  let lastStone: Stone = picked[0];
  for (const stone of picked) {
    cursor = (cursor + 1) % RING_SIZE;
    state.dishes[cursor].stones.push(stone);
    lastStone = stone;
  }

  const finalDish = state.dishes[cursor];
  const total = finalDish.stones.length;
  const scored = applyScore(state, lastStone.ownerId, finalDish.color, total);
  return { landedAt: cursor, scored };
}

// route scoring to the correct color bucket for the owner. returns the
// concrete bucket that received the points so the UI can highlight it.
export function applyScore(
  state: EngineState,
  ownerId: string,
  dishColor: DishColor,
  amount: number,
): { color: DishColor; amount: number; ownerId: string } | null {
  if (amount <= 0) return null;
  let totals = state.totals.get(ownerId);
  if (!totals) {
    totals = freshTotals();
    state.totals.set(ownerId, totals);
  }
  const targetColor: DishColor = (() => {
    if (dishColor === 'W') return lowestColor(totals);
    if (dishColor === 'K') return highestColor(totals);
    return dishColor;
  })();
  if (targetColor === 'R' || targetColor === 'B' || targetColor === 'G') {
    totals[targetColor] += amount;
  }
  return { color: targetColor, amount, ownerId };
}

// tie-break for Angel/Devil routing: stable color order R, B, G.
export function lowestColor(totals: ColorTotals): DishColor {
  const order: ('R' | 'B' | 'G')[] = ['R', 'B', 'G'];
  return order.reduce((best, c) => (totals[c] < totals[best] ? c : best), order[0]);
}

export function highestColor(totals: ColorTotals): DishColor {
  const order: ('R' | 'B' | 'G')[] = ['R', 'B', 'G'];
  return order.reduce((best, c) => (totals[c] > totals[best] ? c : best), order[0]);
}

export function finalScore(totals: ColorTotals): number {
  const vals = [totals.R, totals.B, totals.G];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return min - (max - min);
}

// end condition: any player has reached >= 30 in any single color.
export function gameOverWinner(state: EngineState): string | null {
  for (const [id, totals] of state.totals.entries()) {
    if (totals.R >= SCORE_END_THRESHOLD || totals.B >= SCORE_END_THRESHOLD || totals.G >= SCORE_END_THRESHOLD) {
      return id;
    }
  }
  return null;
}

// when nobody has any stones owned anywhere, all players must pass and the
// game ends. returns true when no player can act.
export function noPlayerCanAct(state: EngineState, playerIds: readonly string[]): boolean {
  for (const id of playerIds) {
    if (legalPickMoves(state, id).length > 0) return false;
  }
  return true;
}
