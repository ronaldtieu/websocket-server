// scoring for archduke. each round, remaining set cards are summed.
// lowest round total wins the round (goal is to minimize your set value).
// total score accumulates across rounds; lowest total after all rounds wins.

import { cardValue } from './cards.js';
import type { Card, SlotState } from './types.js';

export function scoreSet(slots: readonly SlotState[]): number {
  let total = 0;
  for (const s of slots) {
    if (s.kind === 'card') total += cardValue(s.card);
  }
  return total;
}

// the winner of a round is the player with the lowest round score.
// ties are broken arbitrarily (first in the input order) since this is
// sum-to-minimum — ties don't affect the elimination mechanic yet.
export function pickRoundWinner(
  roundScores: { playerId: string; score: number }[],
): string | null {
  if (roundScores.length === 0) return null;
  let bestId = roundScores[0].playerId;
  let bestScore = roundScores[0].score;
  for (let i = 1; i < roundScores.length; i += 1) {
    if (roundScores[i].score < bestScore) {
      bestScore = roundScores[i].score;
      bestId = roundScores[i].playerId;
    }
  }
  return bestId;
}

// helper for reveals: convert set slots into a flat "card or null" list.
export function slotsToRevealed(slots: readonly SlotState[]): (Card | null)[] {
  return slots.map((s) => (s.kind === 'card' ? s.card : null));
}
