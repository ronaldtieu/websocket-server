// pure scoring helpers for remove one

import type { Card } from './types.js';

export interface Play {
  playerId: string;
  card: Card;
}

export interface ScoringResult {
  winnerId: string | null; // null if every card clashed
  winningCard: Card | null;
  clashed: Card[]; // cards that were excluded due to duplicates
}

// smallest unique number rule:
// - among all played cards, find values that appear exactly once
// - winner is whoever played the smallest such value
// - cards that appear more than once are "clashed" and excluded
export function resolveRound(plays: Play[]): ScoringResult {
  if (plays.length === 0) return { winnerId: null, winningCard: null, clashed: [] };

  const counts = new Map<Card, number>();
  for (const p of plays) counts.set(p.card, (counts.get(p.card) ?? 0) + 1);

  const clashed: Card[] = [];
  const uniqueCards: Card[] = [];
  for (const [card, n] of counts.entries()) {
    if (n > 1) clashed.push(card);
    else uniqueCards.push(card);
  }

  if (uniqueCards.length === 0) return { winnerId: null, winningCard: null, clashed };

  const smallest = Math.min(...uniqueCards) as Card;
  const winner = plays.find((p) => p.card === smallest);
  return {
    winnerId: winner ? winner.playerId : null,
    winningCard: smallest,
    clashed,
  };
}
