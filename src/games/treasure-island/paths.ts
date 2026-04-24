// Path legality + traversal for Treasure Island.
//
// Each placed arrow is a straight line between two cells. Both endpoints
// must be red dots (public rule). Arrow length = chebyshev(|dx|,|dy|) and
// must match the arrow definition's length.
//
// Two flags get computed during validation:
//   - diagonal: dx and dy are both non-zero (i.e. not a pure orthogonal step)
//   - crossesFence: the line passes through any of the board's fence edges
// Both flags require the hidden rule to be unlocked. The first time any
// player attempts a path with diagonal=true OR crossesFence=true, the rule
// gets unlocked publicly.
//
// Also computed: every cell the arrow passes through, used to detect which
// boxes (if any) the player reaches. The reach order matters — the engine
// awards VP to the first arrow in turn order to step on each box.

import type { ArrowDef, BoardLayout, PlacedArrow } from './types.js';
import {
  buildBoxByCell,
  buildFenceSet,
  buildRedDotSet,
  fenceKey,
  fromIdx,
  idx,
  isLand,
} from './board.js';

export interface ArrowAttempt {
  arrowId: string;
  fromIdx: number;
  toIdx: number;
}

export interface ValidatedArrow extends PlacedArrow {
  // ordered cell indices traversed (inclusive). length === step count + 1.
  cellsTraversed: number[];
}

export interface ValidationContext {
  layout: BoardLayout;
  arrowsById: Map<string, ArrowDef>;
  hiddenRuleUnlocked: boolean;
}

export interface ValidationResult {
  ok: boolean;
  arrow?: ValidatedArrow;
  // when ok=false, reason is a short error string. when ok=true and the
  // attempt would unlock the hidden rule, requestUnlock is true.
  reason?: string;
  requestUnlock?: boolean;
}

export function validateArrow(
  attempt: ArrowAttempt,
  ctx: ValidationContext,
): ValidationResult {
  const { layout, arrowsById, hiddenRuleUnlocked } = ctx;

  const def = arrowsById.get(attempt.arrowId);
  if (!def) return { ok: false, reason: 'unknown arrow' };

  if (attempt.fromIdx === attempt.toIdx) {
    return { ok: false, reason: 'arrow must move' };
  }

  const redDots = buildRedDotSet(layout);
  if (!redDots.has(attempt.fromIdx) || !redDots.has(attempt.toIdx)) {
    return { ok: false, reason: 'arrow endpoints must be red dots' };
  }

  const a = fromIdx(attempt.fromIdx);
  const b = fromIdx(attempt.toIdx);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // straight-line constraint: pure horizontal, vertical, or 45° diagonal.
  const isStraight = dx === 0 || dy === 0 || adx === ady;
  if (!isStraight) {
    return { ok: false, reason: 'arrow must travel in a straight line' };
  }

  const length = Math.max(adx, ady);
  if (length !== def.length) {
    return { ok: false, reason: `arrow length must equal ${def.length}` };
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const cellsTraversed: number[] = [attempt.fromIdx];
  const fences = buildFenceSet(layout);
  let crossesFence = false;

  // walk one chebyshev step at a time. for diagonal moves, also consult both
  // half-step fence edges (we treat a diagonal as crossing a fence if either
  // of the two adjacent orthogonal fences is present along the path).
  let cx = a.x;
  let cy = a.y;
  for (let step = 0; step < length; step += 1) {
    const nx = cx + stepX;
    const ny = cy + stepY;
    const cellHere = idx(cx, cy);
    const cellNext = idx(nx, ny);
    if (!isLand(layout, cellNext)) {
      return { ok: false, reason: 'arrow cannot cross water' };
    }

    if (stepX !== 0 && stepY !== 0) {
      // diagonal step — check the two orthogonal fences that "wrap" the move
      const horiz = fenceKey(cellHere, idx(nx, cy));
      const vert = fenceKey(cellHere, idx(cx, ny));
      if (fences.has(horiz) || fences.has(vert)) crossesFence = true;
    } else {
      const direct = fenceKey(cellHere, cellNext);
      if (fences.has(direct)) crossesFence = true;
    }

    cellsTraversed.push(cellNext);
    cx = nx;
    cy = ny;
  }

  const diagonal = adx > 0 && ady > 0;
  const needsHiddenRule = diagonal || crossesFence;
  if (needsHiddenRule && !hiddenRuleUnlocked) {
    // attempt is structurally legal but server will treat the placement as
    // an *unlock event*: the engine accepts it and reveals the rule.
    return {
      ok: true,
      requestUnlock: true,
      arrow: {
        arrowId: attempt.arrowId,
        fromIdx: attempt.fromIdx,
        toIdx: attempt.toIdx,
        diagonal,
        crossesFence,
        cellsTraversed,
      },
    };
  }

  return {
    ok: true,
    arrow: {
      arrowId: attempt.arrowId,
      fromIdx: attempt.fromIdx,
      toIdx: attempt.toIdx,
      diagonal,
      crossesFence,
      cellsTraversed,
    },
  };
}

// validate an entire path (a player's full placement for the round). returns
// per-arrow results and whether the path collectively unlocks the hidden
// rule. the engine commits the path atomically — if any arrow is illegal
// (apart from unlock), the whole path is rejected.
export function validatePath(
  attempts: ArrowAttempt[],
  ctx: ValidationContext,
): {
  ok: boolean;
  arrows: ValidatedArrow[];
  reason?: string;
  unlocks: boolean;
} {
  if (attempts.length === 0) {
    return { ok: true, arrows: [], unlocks: false };
  }
  const seen = new Set<string>();
  const out: ValidatedArrow[] = [];
  let unlocks = false;
  for (const att of attempts) {
    if (seen.has(att.arrowId)) {
      return { ok: false, arrows: [], unlocks: false, reason: 'arrow used twice' };
    }
    seen.add(att.arrowId);
    const r = validateArrow(att, ctx);
    if (!r.ok || !r.arrow) {
      return { ok: false, arrows: [], unlocks: false, reason: r.reason };
    }
    if (r.requestUnlock) unlocks = true;
    out.push(r.arrow);
  }
  return { ok: true, arrows: out, unlocks };
}

// list every box reached by the path, in traversal order. if a single arrow
// happens to walk through multiple box cells, all are reached (in order).
export function boxesReachedByPath(
  arrows: ValidatedArrow[],
  layout: BoardLayout,
): { boxId: string; arrowIndex: number }[] {
  const boxByCell = buildBoxByCell(layout);
  const reached: { boxId: string; arrowIndex: number }[] = [];
  for (let i = 0; i < arrows.length; i += 1) {
    const arr = arrows[i];
    for (const cell of arr.cellsTraversed) {
      const box = boxByCell.get(cell);
      if (box) reached.push({ boxId: box.id, arrowIndex: i });
    }
  }
  return reached;
}
