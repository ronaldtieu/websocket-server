// shared CPU difficulty helper. every game's CPU driver uses this to
// decide whether to play the evaluator's best move or a random legal
// move this tick. tiers: easy makes lots of mistakes, medium hovers
// around a ~40-50% win rate, hard plays near-optimally. tune per game
// after playtesting.

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DEFAULT_DIFFICULTY: Difficulty = 'medium';

// probability a move is a random legal move instead of the evaluator's pick.
export const RANDOM_RATE: Record<Difficulty, number> = {
  easy: 0.8,
  medium: 0.4,
  hard: 0.05,
};

export function pickWithDifficulty<T>(
  legalMoves: readonly T[],
  bestMove: T,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): T {
  if (legalMoves.length === 0) {
    throw new Error('pickWithDifficulty: no legal moves');
  }
  if (Math.random() < RANDOM_RATE[difficulty]) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }
  return bestMove;
}

// convenience: when a game has no evaluator yet, just pick any legal move
// but still respect the difficulty knob so easy/medium/hard feel distinct
// by the spread of outcomes over time.
export function pickRandomLegal<T>(legalMoves: readonly T[]): T {
  if (legalMoves.length === 0) {
    throw new Error('pickRandomLegal: no legal moves');
  }
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}
