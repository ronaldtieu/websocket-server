// CPU driver for Balance Mancala.
// playing phase uses depth-2 minimax with alpha-beta pruning. evaluator
// is `−|currentFinalScore − maxOpponentFinalScore|` for the CPU; higher
// is better. that prizes "pull ahead of the leading rival" which feels
// natural for the balance-this-against-that scoring shape.
// placement phase uses a 1-ply heuristic: drop on a dish whose color you
// currently lag in (or W/K, since those route to lowest/highest).

import type { CpuDriver } from '../registry.js';
import { pickWithDifficulty } from '../cpu/difficulty.js';
import type { BalanceMancalaGame } from './BalanceMancalaGame.js';
import {
  cloneEngineState,
  finalScore,
  freshTotals,
  gameOverWinner,
  legalPickMoves,
  legalPlacementMoves,
  lowestColor,
  noPlayerCanAct,
  sowAndScore,
  type EngineState,
} from './rules.js';

const SEARCH_DEPTH = 2;

// evaluator: prefer being further ahead of the best opponent.
// returning a tiny constant for terminal states avoids degenerate ties.
function evaluate(state: EngineState, cpuId: string, opponentIds: readonly string[]): number {
  const myTotals = state.totals.get(cpuId) ?? freshTotals();
  const myFinal = finalScore(myTotals);
  let bestOppFinal = -Infinity;
  for (const oid of opponentIds) {
    const t = state.totals.get(oid) ?? freshTotals();
    const f = finalScore(t);
    if (f > bestOppFinal) bestOppFinal = f;
  }
  if (bestOppFinal === -Infinity) bestOppFinal = 0;
  // closer to / above the best opponent is better
  return myFinal - bestOppFinal;
}

// minimax with alpha-beta. returns the evaluator score from the CPU's POV.
// "max" turn = CPU; "min" turn = the next opponent in the turn rotation.
// we treat all opponents as a single adversary — they'd all play to hurt
// the CPU. a deeper, multi-min-player search would be more accurate but
// blows up branching factor; for a reactive bot this is plenty.
function minimax(
  state: EngineState,
  turnOrder: readonly string[],
  turnIdx: number,
  depth: number,
  cpuId: string,
  opponentIds: readonly string[],
  alpha: number,
  beta: number,
): number {
  // terminal checks
  const winner = gameOverWinner(state);
  if (winner !== null) {
    return winner === cpuId ? 1_000 : -1_000;
  }
  if (depth === 0 || noPlayerCanAct(state, turnOrder)) {
    return evaluate(state, cpuId, opponentIds);
  }

  const playerId = turnOrder[turnIdx % turnOrder.length];
  const moves = legalPickMoves(state, playerId);
  if (moves.length === 0) {
    // forced pass — advance to next player without consuming depth
    return minimax(
      state,
      turnOrder,
      turnIdx + 1,
      depth,
      cpuId,
      opponentIds,
      alpha,
      beta,
    );
  }

  const isMax = playerId === cpuId;
  let best = isMax ? -Infinity : Infinity;

  for (const move of moves) {
    const next = cloneEngineState(state);
    sowAndScore(next, move);
    const score = minimax(
      next,
      turnOrder,
      turnIdx + 1,
      depth - 1,
      cpuId,
      opponentIds,
      alpha,
      beta,
    );
    if (isMax) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break; // prune
  }
  return best;
}

// pick the placement dish that most balances our color totals. white/black
// dishes are biased toward when we have a clear low/high color to feed.
function bestPlacement(
  state: EngineState,
  cpuId: string,
): number {
  const totals = state.totals.get(cpuId) ?? freshTotals();
  const lowest = lowestColor(totals);
  const moves = legalPlacementMoves();
  let best = moves[0];
  let bestScore = -Infinity;
  for (const idx of moves) {
    const dishColor = state.dishes[idx].color;
    let score = 0;
    if (dishColor === lowest) score += 3;
    else if (dishColor === 'W') score += 2; // angel will route to lowest later
    else if (dishColor === 'R' || dishColor === 'B' || dishColor === 'G') score += 1;
    // mild penalty for piling onto the devil dish (boosts your top color)
    if (dishColor === 'K') score -= 1;
    // tiny tiebreak: prefer dishes that currently have other stones (creates
    // dynamic positions for the playing phase).
    score += state.dishes[idx].stones.length * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

export const driveBalanceMancalaCpus: CpuDriver = ({ game, cpuPlayerIds, difficulty, schedule }) => {
  const mancala = game as BalanceMancalaGame;
  if (mancala.getPhase() !== 'placement' && mancala.getPhase() !== 'playing') return;

  const turnOrder = mancala.getTurnOrder();
  const currentIdx = mancala.getCurrentTurnIndex();
  const currentId = turnOrder[currentIdx % turnOrder.length];
  if (!cpuPlayerIds.includes(currentId)) return;

  schedule(() => {
    // re-validate the active player when the timer fires — phase / turn
    // may have moved on while we were sleeping.
    const phaseNow = mancala.getPhase();
    const cur = mancala.getTurnOrder()[mancala.getCurrentTurnIndex() % mancala.getTurnOrder().length];
    if (cur !== currentId) return;
    if (phaseNow === 'placement') {
      const engine = mancala.cloneEngineForSearch();
      const moves = legalPlacementMoves();
      const best = bestPlacement(engine, currentId);
      const pick = pickWithDifficulty(moves, best, difficulty);
      game.handleAction(currentId, {
        type: 'mancala/place-initial',
        payload: { dishIndex: pick },
      });
      return;
    }
    if (phaseNow === 'playing') {
      const engine = mancala.cloneEngineForSearch();
      const moves = legalPickMoves(engine, currentId);
      if (moves.length === 0) return; // engine will auto-pass
      const opponentIds = mancala.getTurnOrder().filter((id) => id !== currentId);
      let bestMove = moves[0];
      let bestScore = -Infinity;
      for (const move of moves) {
        const next = cloneEngineState(engine);
        sowAndScore(next, move);
        const score = minimax(
          next,
          mancala.getTurnOrder(),
          mancala.getCurrentTurnIndex() + 1,
          SEARCH_DEPTH - 1,
          currentId,
          opponentIds,
          -Infinity,
          Infinity,
        );
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
      const pick = pickWithDifficulty(moves, bestMove, difficulty);
      game.handleAction(currentId, {
        type: 'mancala/pick-dish',
        payload: { dishIndex: pick },
      });
    }
  });
};
